import * as Haptics from 'expo-haptics';

/**
 * The app's haptics, in one place so every screen feels the same:
 * - `tap`: a light tap for a switch, chip or toggle;
 * - `select`: a selection tick for a segmented control or a picked option;
 * - `success`: something was saved or finished;
 * - `warning`: something failed;
 * - `turn`: the turn changed in a live round.
 * The Timer's beeps keep their own (timer-signals.ts). A device without
 * haptics, or with them off, simply ignores them.
 */
export const haptics = {
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  select: () => void Haptics.selectionAsync().catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  turn: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
};

export type HapticKind = keyof typeof haptics;
