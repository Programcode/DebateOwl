import { useSyncExternalStore } from 'react';
import { opponentVoice, type OpponentVoiceState } from './opponent-voice';

/** The opponent voice's current state, for components that show or control it. */
export function useOpponentVoice(): OpponentVoiceState {
  return useSyncExternalStore(opponentVoice.subscribe, opponentVoice.getState);
}
