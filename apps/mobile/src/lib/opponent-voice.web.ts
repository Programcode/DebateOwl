import { useSyncExternalStore } from 'react';

import type { OpponentUtterance, OpponentVoiceState } from './opponent-voice';

export type { OpponentUtterance, OpponentVoiceState };

/**
 * The web preview never calls the voice function or plays audio. It keeps
 * each reply it would speak on `window` for the screenshot script and shows
 * the opponent speaking for two seconds of the page's clock. The phone app
 * uses opponent-voice.ts.
 */
class PreviewVoice {
  private state: OpponentVoiceState = { status: 'idle', engine: null, notice: null };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onEnd: (() => void) | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): OpponentVoiceState => this.state;

  private set(state: OpponentVoiceState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  beginRound = () => this.stop();

  speak(utterance: OpponentUtterance, onEnd?: () => void) {
    this.stop();
    const target = window as unknown as { __debatelabOpponentVoice?: { feature: string; segments: number }[] };
    (target.__debatelabOpponentVoice ??= []).push({ feature: utterance.feature, segments: utterance.voice?.segments.length ?? 0 });
    this.onEnd = onEnd ?? null;
    this.set({ status: 'speaking', engine: utterance.voice ? 'elevenlabs' : 'device', notice: null });
    this.timer = setTimeout(() => this.stop(), 2_000);
  }

  stop = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const onEnd = this.onEnd;
    this.onEnd = null;
    if (this.state.status !== 'idle') this.set({ ...this.state, status: 'idle', engine: null });
    onEnd?.();
  };
}

export const opponentVoice = new PreviewVoice();

export function useOpponentVoice(): OpponentVoiceState {
  return useSyncExternalStore(opponentVoice.subscribe, opponentVoice.getState, opponentVoice.getState);
}
