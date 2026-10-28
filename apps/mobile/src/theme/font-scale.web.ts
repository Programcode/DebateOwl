/**
 * react-native-web ignores the system text size, so the screenshot script
 * sets `window.__debateowlFontScale` before the app loads to draw a Dynamic
 * Type size (3.1 is iOS's largest accessibility size for body text). Text and
 * fields multiply their font sizes by it, capped by maxFontSizeMultiplier as
 * on iOS.
 */
export function webFontScale(): number {
  const scale = (window as unknown as { __debateowlFontScale?: unknown }).__debateowlFontScale;
  return typeof scale === 'number' && scale > 0 ? scale : 1;
}
