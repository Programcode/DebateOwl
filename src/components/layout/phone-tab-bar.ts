/** Overlap below this is the browser chrome (the URL bar), not the keyboard. */
export const KEYBOARD_OPEN_PX = 120;

/** Same cutoff as Tailwind `md`: the tab bar exists only below this. */
export const PHONE_TAB_MEDIA = '(width < 48rem)';

const NON_TEXT_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image', 'hidden']);

/**
 * How much of the layout viewport the keyboard covers.
 * `visualViewport` shrinks and may shift when the keyboard opens; a collapsing
 * URL bar moves it by less than `KEYBOARD_OPEN_PX`.
 */
export function keyboardOverlap(layoutHeight: number, visualHeight: number, offsetTop: number): number {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight) || !Number.isFinite(offsetTop)) return 0;
  return Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));
}

/** A text field, not a button or a toggle. Pinch-zoom is not a keyboard. */
export function isTextEntry(tagName: string, inputType: string | null, contentEditable: boolean): boolean {
  if (contentEditable) return true;
  if (tagName === 'TEXTAREA') return true;
  if (tagName === 'INPUT') return !NON_TEXT_INPUTS.has((inputType || 'text').toLowerCase());
  return false;
}

/**
 * True only for a real keyboard: a text field is focused, the page is not
 * pinch-zoomed, and the visual viewport has shrunk by at least `KEYBOARD_OPEN_PX`.
 */
export function keyboardIsOpen(
  layoutHeight: number,
  visualHeight: number,
  offsetTop: number,
  scale: number,
  textEntryFocused: boolean,
): boolean {
  if (!textEntryFocused) return false;
  if (!Number.isFinite(scale) || scale > 1) return false;
  return keyboardOverlap(layoutHeight, visualHeight, offsetTop) >= KEYBOARD_OPEN_PX;
}
