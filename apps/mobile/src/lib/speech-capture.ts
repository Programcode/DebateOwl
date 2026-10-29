import { LONG_PAUSE_SECONDS, type SpeechTake } from '@debatelab/core/voice/delivery';

import type { Recognizer } from './speech-recognition';

// Speech capture for a spoken turn or a dictated field, as the website's
// useSpeechCapture (src/hooks/use-speech-capture.ts): a turn can run for
// minutes, so recognition starts again when iOS ends it (silence, or its own
// limit on one request), interim words show as they come, and the take is
// timed. The audio goes from the microphone to Apple's recognizer only;
// DebateOwl never receives or stores it.

export type SpeechCaptureError = 'not-allowed' | 'no-microphone' | 'network' | 'start-failed';

export interface CaptureState {
  listening: boolean;
  /** Words heard but not yet final. */
  interim: string;
  error: SpeechCaptureError | null;
}

const STOP_GRACE_MS = 1_500;
/** A recognizer that keeps dying this quickly is not going to recover. */
const MIN_HEALTHY_SESSION_MS = 750;
const MAX_QUICK_FAILURES = 3;

export interface CaptureOptions {
  /** BCP-47, such as en-US. */
  lang: string;
  onFinalText: (text: string) => void;
  /** The student refused the microphone or speech recognition. */
  onDenied?: () => void;
  now?: () => number;
}

const emptyTake = (): SpeechTake => ({ text: '', speakingMs: 0, pausesMs: [] });

// iOS has one recognizer for the app, and every capture listens to its events.
// Only one capture may use it at a time: starting one cancels any other, so a
// screen left listening under another never hears, or ends, the new one's session.
const owner: { current: SpeechCapture | null } = { current: null };

export class SpeechCapture {
  private state: CaptureState = { listening: false, interim: '', error: null };
  private listeners = new Set<() => void>();
  private subscriptions: { remove(): void }[] = [];
  private want = false;
  private take = emptyTake();
  private startedAt = 0;
  private sessionStartedAt = 0;
  private lastResultAt: number | null = null;
  private quickFailures = 0;
  private stopped: (() => void) | null = null;
  private stopping: Promise<void> | null = null;
  // Bumped by every start, stop and cancel, so a start still waiting for the
  // permission prompt can tell it is no longer wanted.
  private attempt = 0;

  constructor(private recognizer: Recognizer, private options: CaptureOptions) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): CaptureState => this.state;

  private set(patch: Partial<CaptureState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  setOptions(options: CaptureOptions) {
    this.options = options;
  }

  private commitFinal(text: string) {
    const clean = text.trim();
    if (!clean) return;
    this.take.text = this.take.text ? `${this.take.text} ${clean}` : clean;
    this.options.onFinalText(clean);
  }

  private detach() {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    if (owner.current === this) owner.current = null;
  }

  private finishListening() {
    if (this.startedAt) this.take.speakingMs += this.now() - this.startedAt;
    this.startedAt = 0;
    // Words still marked interim when the recognizer closes were spoken.
    this.commitFinal(this.state.interim);
    this.detach();
    this.want = false;
    this.set({ interim: '', listening: false });
    const stopped = this.stopped;
    this.stopped = null;
    this.stopping = null;
    stopped?.();
  }

  private fail(reason: SpeechCaptureError) {
    if (reason === 'not-allowed') this.options.onDenied?.();
    this.set({ error: reason });
    this.detach();
    try {
      this.recognizer.abort();
    } catch {
      // Already closed.
    }
    this.finishListening();
  }

  private begin() {
    this.sessionStartedAt = this.now();
    this.recognizer.start({
      lang: this.options.lang,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      iosTaskHint: 'dictation',
    });
  }

  start = async (): Promise<boolean> => {
    if (this.want || this.state.listening) return false;
    if (owner.current && owner.current !== this) owner.current.cancel();
    owner.current = this;
    this.set({ error: null });
    this.want = true;
    const attempt = ++this.attempt;
    let granted = false;
    try {
      // Ask up front, so a refusal is reported clearly.
      granted = (await this.recognizer.requestPermissionsAsync()).granted;
    } catch {
      granted = false;
    }
    // The turn was submitted or ended while the permission prompt was open.
    if (attempt !== this.attempt) return false;
    if (!granted) {
      this.want = false;
      this.options.onDenied?.();
      this.set({ error: 'not-allowed' });
      return false;
    }

    this.subscriptions = [
      this.recognizer.addListener('result', (event) => {
        const now = this.now();
        const last = this.lastResultAt;
        if (last !== null && now - last >= LONG_PAUSE_SECONDS * 1_000) this.take.pausesMs.push(now - last);
        this.lastResultAt = now;
        const transcript = event.results[0]?.transcript ?? '';
        if (event.isFinal) {
          this.commitFinal(transcript);
          this.set({ interim: '' });
        } else {
          this.set({ interim: transcript.trim() });
        }
      }),
      this.recognizer.addListener('error', (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') this.fail('not-allowed');
        else if (event.error === 'audio-capture') this.fail('no-microphone');
        else if (event.error === 'network') this.fail('network');
        else if (event.error === 'language-not-supported' || event.error === 'bad-grammar') this.fail('start-failed');
        // no-speech, aborted, interrupted and the like end the session; 'end' decides what follows.
      }),
      this.recognizer.addListener('end', () => this.onEnd()),
    ];
    this.quickFailures = 0;
    this.lastResultAt = null;
    this.startedAt = this.now();
    try {
      this.begin();
    } catch {
      this.fail('start-failed');
      return false;
    }
    this.set({ listening: true });
    return true;
  };

  private onEnd() {
    if (!this.want) {
      this.finishListening();
      return;
    }
    // iOS closed the session (silence, or its own limit) while the student is
    // still on the clock. Carry on listening.
    this.commitFinal(this.state.interim);
    this.set({ interim: '' });
    this.quickFailures = this.now() - this.sessionStartedAt < MIN_HEALTHY_SESSION_MS ? this.quickFailures + 1 : 0;
    if (this.quickFailures >= MAX_QUICK_FAILURES) {
      this.fail('start-failed');
      return;
    }
    try {
      this.begin();
    } catch {
      this.fail('start-failed');
    }
  }

  /** Stops listening and resolves once the last words have arrived. */
  stop = (): Promise<void> => {
    // A second caller (the Stop button, then Submit) joins the stop in progress.
    if (this.stopping) return this.stopping;
    this.want = false;
    this.attempt += 1;
    if (!this.state.listening) return Promise.resolve();
    // The recognizer delivers its last words after stop(), then ends.
    const stopping = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        try {
          this.recognizer.abort();
        } catch {
          // Already closed.
        }
        this.finishListening();
      }, STOP_GRACE_MS);
      this.stopped = () => {
        clearTimeout(timeout);
        resolve();
      };
      try {
        this.recognizer.stop();
      } catch {
        this.finishListening();
      }
    });
    // finishListening may already have run (a recognizer that ended at once) and released it.
    if (this.stopped) this.stopping = stopping;
    return stopping;
  };

  /**
   * Drops everything: a start still waiting for permission, the open
   * recognizer, pending words and the take. For a turn or round that ends
   * some other way than by submitting what was said.
   */
  cancel = () => {
    this.attempt += 1;
    this.want = false;
    const wasListening = this.state.listening;
    this.detach();
    if (wasListening) {
      try {
        this.recognizer.abort();
      } catch {
        // Already closed.
      }
    }
    this.startedAt = 0;
    this.lastResultAt = null;
    this.take = emptyTake();
    this.set({ interim: '', listening: false });
    // Anyone waiting on a stop is released; there is nothing left to wait for.
    const stopped = this.stopped;
    this.stopped = null;
    this.stopping = null;
    stopped?.();
  };

  /** Everything captured since the last reset, across pauses and restarts. */
  getTake = (): SpeechTake => ({
    ...this.take,
    pausesMs: [...this.take.pausesMs],
    speakingMs: this.take.speakingMs + (this.startedAt ? this.now() - this.startedAt : 0),
  });

  resetTake = () => {
    this.take = emptyTake();
    this.lastResultAt = null;
  };
}
