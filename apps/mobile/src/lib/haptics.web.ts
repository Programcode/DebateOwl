/**
 * The web preview has no haptics. It records each one on `window` instead,
 * so the screenshot script can check that the right one fired. The phone app
 * uses haptics.ts.
 */
function record(kind: string) {
  const target = window as unknown as { __debatelabHaptics?: string[] };
  (target.__debatelabHaptics ??= []).push(kind);
}

export const haptics = {
  tap: () => record('tap'),
  select: () => record('select'),
  success: () => record('success'),
  warning: () => record('warning'),
  turn: () => record('turn'),
};

export type HapticKind = keyof typeof haptics;
