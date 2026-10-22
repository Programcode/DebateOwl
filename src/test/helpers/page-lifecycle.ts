import { act } from '@testing-library/react';

/** What a browser fires when it restores a page from the back/forward cache. */
export function restoreFromBackForwardCache() {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  act(() => {
    window.dispatchEvent(event);
  });
}

export function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Drops the override from setVisibility so jsdom's own getter applies again. */
export function restoreVisibility() {
  delete (document as { visibilityState?: unknown }).visibilityState;
}
