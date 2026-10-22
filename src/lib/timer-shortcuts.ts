const INTERACTIVE_SELECTOR = [
  'button',
  'select',
  'a',
  'input',
  'textarea',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="dialog"]',
  '[role="combobox"]',
].join(', ');

/**
 * Timer keys are on the window. They must stay out of controls that already use
 * Space, Escape, and the arrow keys, including a menu that just consumed Escape.
 */
export function timerShortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}
