import { Alert } from 'react-native';

import type { Debate } from './debates';

export type MotionChoice = { kind: 'switch'; debateId: string } | { kind: 'create' } | { kind: 'one-off' } | null;

export interface MotionGateText {
  title: string;
  message: string;
  switchLabel: string;
  createLabel: string;
  onceLabel: string;
  cancel: string;
}

/**
 * The website's DebateMotionGate as a native alert: a motion other than the
 * Current Debate's asks whether to switch to a debate with that motion,
 * create one, or use the motion once. Resolves null when cancelled.
 */
export function chooseMotionTarget(matches: Debate[], text: MotionGateText): Promise<MotionChoice> {
  return new Promise((resolve) => {
    Alert.alert(text.title, text.message, [
      ...matches.map((debate) => ({ text: text.switchLabel, onPress: () => resolve({ kind: 'switch' as const, debateId: debate.id }) })),
      { text: text.createLabel, onPress: () => resolve({ kind: 'create' }) },
      { text: text.onceLabel, onPress: () => resolve({ kind: 'one-off' }) },
      { text: text.cancel, style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}
