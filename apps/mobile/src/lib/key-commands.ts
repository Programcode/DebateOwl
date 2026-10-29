/**
 * iPad hardware-keyboard shortcuts (⌘N, ⌘K, ⌘↩) need UIKeyCommand, which
 * neither React Native nor Expo Go exposes. Until the development build
 * carries a key-command module, the native app registers nothing and the
 * shortcuts work in the web preview only (key-commands.web.ts).
 * TODO(key-commands): wire a dev-build module here behind nativeCapabilities().
 */
export type KeyCombo = 'cmd+n' | 'cmd+k' | 'cmd+enter';

export function useKeyCommand(_combo: KeyCombo, _handler: () => void, _enabled = true): void {}
