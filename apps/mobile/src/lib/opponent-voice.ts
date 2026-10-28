import { toIntlLocale, type AppLanguage } from '@debatelab/core/languages';
import { stripAudioTags } from '@debatelab/core/contract/voice-tags';
import type { VoiceFeature, VoicePayload, VoiceSegment } from '@debatelab/core/voice/payload';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';
import { supabaseProject } from './supabase-config';

// The opponent's voice, as the website's src/lib/voice/opponent-voice.ts.
// ElevenLabs speaks through DebateOwl's `voice` Edge Function, one signed
// segment at a time; whenever that is not possible (no key on the server,
// the daily allowance is used up, the call fails) iOS's own voice reads the
// same reply and the round goes on. Nothing is recorded: the clip is played
// from the cache and deleted.

export interface OpponentUtterance {
  feature: VoiceFeature;
  /** The reply as shown on screen: no audio tags. */
  text: string;
  /** Signed segments for ElevenLabs. Without them the device voice reads `text`. */
  voice?: VoicePayload;
  language: AppLanguage;
}

export type VoiceStatus = 'idle' | 'loading' | 'speaking';
/** Why the device voice took over, when the student should know. */
export type VoiceNotice = 'limit' | null;

export interface OpponentVoiceState {
  status: VoiceStatus;
  engine: 'elevenlabs' | 'device' | null;
  notice: VoiceNotice;
}

const REQUEST_TIMEOUT_MS = 30_000;

class VoiceRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined) {
    super(`Voice request failed (${status})`);
    this.name = 'VoiceRequestError';
  }
}

async function requestSegmentAudio(feature: VoiceFeature, segment: VoiceSegment, signal: AbortSignal): Promise<Uint8Array> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new VoiceRequestError(401, undefined);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timeout = setTimeout(cancel, REQUEST_TIMEOUT_MS);
  signal.addEventListener('abort', cancel);
  try {
    const response = await fetch(`${supabaseProject.url}/functions/v1/voice`, {
      method: 'POST',
      headers: { apikey: supabaseProject.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, text: segment.text, token: segment.token }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch((): null => null);
      const code = body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : undefined;
      throw new VoiceRequestError(response.status, code);
    }
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

let clipNumber = 0;

class OpponentVoice {
  private state: OpponentVoiceState = { status: 'idle', engine: null, notice: null };
  private listeners = new Set<() => void>();
  private player: AudioPlayer | null = null;
  private abort: AbortController | null = null;
  private run = 0;
  private onEnd: (() => void) | null = null;
  /** Set once the server says ElevenLabs cannot serve this round. */
  private providerOff = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): OpponentVoiceState => this.state;

  private setState(patch: Partial<OpponentVoiceState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Start a round. A failure that asking again would not fix hands the
   * opponent to the device voice for the rest of a round, so a broken or
   * exhausted provider costs at most one failed request per round.
   */
  beginRound = () => {
    this.stop();
    this.providerOff = false;
    if (this.state.notice) this.setState({ notice: null });
  };

  /** Speak one reply. `onEnd` runs once, when it finishes or is stopped. */
  speak(utterance: OpponentUtterance, onEnd?: () => void) {
    this.stop();
    const run = ++this.run;
    this.onEnd = onEnd ?? null;
    this.abort = new AbortController();
    void this.play(utterance, run, this.abort.signal)
      .catch((cause: unknown) => console.warn('The opponent voice failed:', cause instanceof Error ? cause.message : cause))
      .finally(() => this.finish(run));
  }

  stop = () => {
    this.abort?.abort();
    this.abort = null;
    this.releasePlayer();
    void Speech.stop().catch(() => {});
    this.finish(this.run);
  };

  private releasePlayer() {
    const player = this.player;
    this.player = null;
    if (!player) return;
    try {
      player.pause();
      player.remove();
    } catch {
      // Already released.
    }
  }

  private finish(run: number) {
    if (run !== this.run) return;
    // Late callbacks from this reply are ignored from here on.
    this.run += 1;
    const onEnd = this.onEnd;
    this.onEnd = null;
    if (this.state.status !== 'idle') this.setState({ status: 'idle', engine: null });
    onEnd?.();
  }

  private async play(utterance: OpponentUtterance, run: number, signal: AbortSignal) {
    const segments = utterance.voice?.segments ?? [];
    let next = 0;
    // Speech recognition leaves the audio session in record mode; play through the speaker, also on silent.
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, interruptionMode: 'duckOthers' }).catch(() => {});
    if (run !== this.run) return;
    if (segments.length > 0 && !this.providerOff) {
      this.setState({ status: 'loading', engine: 'elevenlabs', notice: null });
      // Fetch one segment ahead so speech does not stall between segments.
      let pending = this.load(utterance.feature, segments[0], signal);
      for (; next < segments.length; next += 1) {
        const clip = await pending;
        if (run !== this.run) return;
        if (!clip) break;
        pending = next + 1 < segments.length ? this.load(utterance.feature, segments[next + 1], signal) : Promise.resolve(null);
        const played = await this.playClip(clip, run);
        if (!played) return;
      }
    }
    if (run !== this.run) return;
    // The device voice reads whatever ElevenLabs did not: the rest of the
    // segments without their tags and any unsigned overflow, or the whole reply.
    const remaining = segments.length > 0
      ? [...segments.slice(next).map((segment) => stripAudioTags(segment.text)), utterance.voice?.overflow ?? ''].join(' ').trim()
      : utterance.text;
    await this.speakWithDevice(remaining, utterance.language, run);
  }

  private async load(feature: VoiceFeature, segment: VoiceSegment, signal: AbortSignal): Promise<File | null> {
    if (this.providerOff) return null;
    try {
      const bytes = await requestSegmentAudio(feature, segment, signal);
      const file = new File(Paths.cache, `opponent-voice-${Date.now()}-${clipNumber++}.mp3`);
      file.create({ overwrite: true });
      file.write(bytes);
      return file;
    } catch (error) {
      if (signal.aborted) return null;
      // The server refused: not configured, not allowed, or ElevenLabs failed.
      // Asking again this round would likely fail the same way and may spend
      // a clip, so the device voice takes the rest of the round. A refused
      // token concerns one reply only; a network error is retried next reply.
      if (error instanceof VoiceRequestError && error.code !== 'voice_token_invalid') {
        this.providerOff = true;
        if (error.code === 'voice_limit_reached') this.setState({ notice: 'limit' });
      }
      return null;
    }
  }

  private async playClip(clip: File, run: number): Promise<boolean> {
    try {
      if (run !== this.run) return false;
      this.setState({ status: 'speaking', engine: 'elevenlabs' });
      const player = createAudioPlayer(clip.uri);
      this.player = player;
      await new Promise<void>((resolve) => {
        const subscription = player.addListener('playbackStatusUpdate', (status) => {
          if (!status.didJustFinish) return;
          subscription.remove();
          resolve();
        });
        // Stopping releases the player; the run check below ends the wait.
        const check = setInterval(() => {
          if (run === this.run && this.player === player) return;
          clearInterval(check);
          subscription.remove();
          resolve();
        }, 200);
        player.play();
      });
      if (this.player === player) this.releasePlayer();
      return run === this.run;
    } finally {
      try {
        clip.delete();
      } catch {
        // The cache is cleared by iOS anyway.
      }
    }
  }

  private async speakWithDevice(text: string, language: AppLanguage, run: number) {
    if (!text.trim() || run !== this.run) return;
    this.setState({ status: 'speaking', engine: 'device' });
    await new Promise<void>((resolve) => {
      Speech.speak(text, { language: toIntlLocale(language), onDone: resolve, onStopped: resolve, onError: () => resolve() });
    });
  }
}

export const opponentVoice = new OpponentVoice();

export function useOpponentVoice(): OpponentVoiceState {
  return useSyncExternalStore(opponentVoice.subscribe, opponentVoice.getState, opponentVoice.getState);
}
