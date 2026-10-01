import { toIntlLocale, type AppLanguage } from '@/lib/languages';
import { getActiveAccessToken, supabase, SUPABASE_URL } from '@/lib/supabase/client';
import { SUPABASE_ANON_KEY } from '@/lib/supabase/env';
import { stripAudioTags } from '../../../supabase/functions/_shared/voice-tags';
import type { VoiceFeature, VoicePayload, VoiceSegment } from './payload';

// The opponent's voice. ElevenLabs speaks through DebateLab's `voice` Edge
// Function, one signed segment at a time. Whenever that is not possible (no
// key on the server, the daily allowance is used up, the call fails) the
// browser's own speechSynthesis reads the same reply and the round goes on.

export interface OpponentUtterance {
  feature: VoiceFeature;
  /** The reply as shown on screen: no audio tags. */
  text: string;
  /** Signed segments for ElevenLabs. Without them the browser voice reads `text`. */
  voice?: VoicePayload;
  language: AppLanguage;
}

export type VoiceStatus = 'idle' | 'loading' | 'speaking' | 'blocked';
/** Why the browser voice took over, when the student should know. */
export type VoiceNotice = 'limit' | null;

export interface OpponentVoiceState {
  status: VoiceStatus;
  engine: 'elevenlabs' | 'browser' | null;
  notice: VoiceNotice;
}

const REQUEST_TIMEOUT_MS = 30_000;
const RESUME_GRACE_MS = 150;
const MAX_BROWSER_UTTERANCE_CHARS = 220;
// Slow speech is about ten characters a second; allow several times that.
const BROWSER_UTTERANCE_BASE_MS = 5_000;
const BROWSER_UTTERANCE_MS_PER_CHAR = 250;

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
}

class VoiceRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined) {
    super(`Voice request failed (${status})`);
    this.name = 'VoiceRequestError';
  }
}

async function requestSegmentAudio(feature: VoiceFeature, segment: VoiceSegment, signal: AbortSignal): Promise<ArrayBuffer> {
  const accessToken = getActiveAccessToken() ?? (await supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken) throw new VoiceRequestError(401, undefined);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/voice`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, text: segment.text, token: segment.token }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch((): null => null);
      const code = body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code
        : undefined;
      throw new VoiceRequestError(response.status, code);
    }
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

// One sentence too long for an utterance is cut after its last clause break
// that fits (a comma, semicolon, colon, or dash before a space), else at the
// last space, else at the limit.
function splitLongSentence(sentence: string): string[] {
  const parts: string[] = [];
  let rest = sentence.trim();
  while (rest.length > MAX_BROWSER_UTTERANCE_CHARS) {
    const window = rest.slice(0, MAX_BROWSER_UTTERANCE_CHARS + 1);
    const clauseBreaks = [...window.matchAll(/[,;:—–](?=\s)/gu)];
    const clauseEnd = (clauseBreaks.at(-1)?.index ?? -1) + 1;
    const space = window.lastIndexOf(' ');
    const minimum = MAX_BROWSER_UTTERANCE_CHARS / 3;
    const cut = clauseEnd > minimum ? clauseEnd : space > minimum ? space : MAX_BROWSER_UTTERANCE_CHARS;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Cut text into utterances short enough that browsers do not drop the tail. */
export function browserUtterances(text: string): string[] {
  const sentences = text.match(/[^.!?…\n]+(?:[.!?…]+["'”’)]*|\n+|$)\s*/gu) ?? [];
  const parts: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + sentence).length > MAX_BROWSER_UTTERANCE_CHARS) {
      parts.push(current.trim());
      current = '';
    }
    // Chrome stops reading partway through a very long utterance.
    if (sentence.trim().length > MAX_BROWSER_UTTERANCE_CHARS) {
      parts.push(...splitLongSentence(sentence));
      continue;
    }
    current += sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

class OpponentVoice {
  private state: OpponentVoiceState = { status: 'idle', engine: null, notice: null };
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private abort: AbortController | null = null;
  private run = 0;
  private onEnd: (() => void) | null = null;
  private resumeBlocked: (() => void) | null = null;
  /** Set once the server says ElevenLabs cannot serve this round. */
  private providerOff = false;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): OpponentVoiceState => this.state;

  private setState(patch: Partial<OpponentVoiceState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Browsers allow audio only after a user gesture. Call this from the click
   * that turns voice on or starts a round so later replies can play.
   */
  unlock = (): void => {
    const Constructor = audioContextConstructor();
    if (!Constructor) return;
    try {
      this.context ??= new Constructor();
      if (this.context.state === 'suspended') void this.context.resume().catch((): void => {});
    } catch {
      this.context = null;
    }
    this.resumeBlocked?.();
  };

  /**
   * Start a round. A failure that asking again would not fix hands the
   * opponent to the browser voice for the rest of a round, so a broken or
   * exhausted provider costs at most one failed request per round. Each new
   * round gives ElevenLabs another chance.
   */
  beginRound = (): void => {
    this.stop();
    this.providerOff = false;
    if (this.state.notice) this.setState({ notice: null });
  };

  /** Forget the round's fallbacks and the audio context, for tests. */
  reset(): void {
    this.stop();
    this.providerOff = false;
    this.context = null;
    this.setState({ status: 'idle', engine: null, notice: null });
  }

  /** Speak one reply. `onEnd` runs once, when it finishes or is stopped. */
  speak(utterance: OpponentUtterance, onEnd?: () => void): void {
    this.stop();
    const run = ++this.run;
    this.onEnd = onEnd ?? null;
    this.abort = new AbortController();
    void this.play(utterance, run, this.abort.signal).finally(() => this.finish(run));
  }

  stop = (): void => {
    this.abort?.abort();
    this.abort = null;
    try { this.source?.stop(); } catch { /* already stopped */ }
    this.source = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.finish(this.run);
  };

  private finish(run: number): void {
    if (run !== this.run) return;
    // Invalidate the run so late callbacks from this reply are ignored.
    this.run += 1;
    // Release a reply that was still waiting for a tap, so it can end.
    const resumeBlocked = this.resumeBlocked;
    this.resumeBlocked = null;
    resumeBlocked?.();
    const onEnd = this.onEnd;
    this.onEnd = null;
    if (this.state.status !== 'idle') this.setState({ status: 'idle', engine: null });
    onEnd?.();
  }

  private async play(utterance: OpponentUtterance, run: number, signal: AbortSignal): Promise<void> {
    const segments = utterance.voice?.segments ?? [];
    let next = 0;
    if (segments.length > 0 && !this.providerOff && await this.audioReady(run)) {
      this.setState({ status: 'loading', engine: 'elevenlabs', notice: null });
      // Fetch one segment ahead so speech does not stall between segments.
      let pending = this.load(utterance.feature, segments[0], signal);
      for (; next < segments.length; next += 1) {
        const audio = await pending;
        if (run !== this.run) return;
        if (!audio) break;
        pending = next + 1 < segments.length ? this.load(utterance.feature, segments[next + 1], signal) : Promise.resolve(null);
        if (!(await this.playBuffer(audio, run))) return;
      }
    }
    if (run !== this.run) return;
    // The browser voice reads whatever ElevenLabs did not: the rest of the
    // segments without their tags and any unsigned overflow past the last
    // segment, or the whole clean reply.
    const remaining = segments.length > 0
      ? [...segments.slice(next).map((segment) => stripAudioTags(segment.text)), utterance.voice?.overflow ?? ''].join(' ').trim()
      : utterance.text;
    await this.speakWithBrowser(remaining, utterance.language, run);
  }

  private async load(feature: VoiceFeature, segment: VoiceSegment, signal: AbortSignal): Promise<AudioBuffer | null> {
    if (this.providerOff || !this.context) return null;
    if (this.state.status !== 'speaking') this.setState({ status: 'loading' });
    try {
      const bytes = await requestSegmentAudio(feature, segment, signal);
      return await this.context.decodeAudioData(bytes);
    } catch (error) {
      if (signal.aborted) return null;
      // The server answered with a refusal: not configured, not deployed,
      // not allowed, or ElevenLabs failed. Asking again this round would
      // likely fail the same way and may spend a clip, so the browser voice
      // takes the rest of the round. A refused token concerns one reply
      // only, whose other segments share its age; the next reply has fresh
      // tokens. A network error is not the server's answer and is retried.
      if (error instanceof VoiceRequestError && error.code !== 'voice_token_invalid') {
        this.providerOff = true;
        if (error.code === 'voice_limit_reached') this.setState({ notice: 'limit' });
      }
      return null;
    }
  }

  /**
   * True once audio can play. A context that the browser keeps suspended
   * (no user gesture yet, for example after a reload) waits for the student
   * to tap Play, before any audio is requested and paid for.
   */
  private async audioReady(run: number): Promise<boolean> {
    const Constructor = audioContextConstructor();
    if (!Constructor) return false;
    try {
      this.context ??= new Constructor();
    } catch {
      return false;
    }
    const context = this.context;
    if (context.state === 'suspended') {
      // resume() can stay pending while autoplay is blocked, so do not wait on it.
      void context.resume().catch((): void => {});
      await new Promise<void>((resolve) => setTimeout(resolve, RESUME_GRACE_MS));
      if (run !== this.run) return false;
    }
    if (context.state === 'suspended') {
      this.setState({ status: 'blocked', engine: 'elevenlabs' });
      await new Promise<void>((resolve) => { this.resumeBlocked = resolve; });
      this.resumeBlocked = null;
    }
    return run === this.run;
  }

  private async playBuffer(audio: AudioBuffer, run: number): Promise<boolean> {
    const context = this.context;
    if (!context) return false;
    this.setState({ status: 'speaking', engine: 'elevenlabs' });
    await new Promise<void>((resolve) => {
      const source = context.createBufferSource();
      source.buffer = audio;
      source.connect(context.destination);
      source.onended = () => resolve();
      this.source = source;
      source.start();
    });
    this.source = null;
    return run === this.run;
  }

  private async speakWithBrowser(text: string, language: AppLanguage, run: number): Promise<void> {
    const parts = browserUtterances(text);
    if (parts.length === 0 || typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    const locale = toIntlLocale(language);
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang === locale)
      ?? window.speechSynthesis.getVoices().find((candidate) => candidate.lang.slice(0, 2) === language);
    this.setState({ status: 'speaking', engine: 'browser' });
    for (const part of parts) {
      if (run !== this.run) return;
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.lang = locale;
        if (voice) utterance.voice = voice;
        // Some browsers never report the end of an utterance. Without a
        // limit the reply would look as if it were still being spoken.
        const limit = setTimeout(resolve, BROWSER_UTTERANCE_BASE_MS + part.length * BROWSER_UTTERANCE_MS_PER_CHAR);
        const done = () => {
          clearTimeout(limit);
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
        window.speechSynthesis.speak(utterance);
      });
    }
  }
}

export const opponentVoice = new OpponentVoice();
export type { OpponentVoice };
