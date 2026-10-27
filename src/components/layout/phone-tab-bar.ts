/** Overlap below this is the browser chrome (the URL bar), not the keyboard. */
export const KEYBOARD_OPEN_PX = 120;

/**
 * How much of the layout viewport the keyboard covers.
 * `visualViewport` shrinks and may shift when the keyboard opens; a collapsing
 * URL bar moves it by less than `KEYBOARD_OPEN_PX`.
 */
export function keyboardOverlap(layoutHeight: number, visualHeight: number, offsetTop: number): number {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight) || !Number.isFinite(offsetTop)) return 0;
  return Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));
}
