import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard, KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNativeApp, openExternalUrl } from '@/lib/native';

export function shouldOpenExternalUrl(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

export function configureNativeRuntime() {
  if (!isNativeApp()) return;

  document.documentElement.classList.add('capacitor-native');
  let lastHapticAt = 0;

  StatusBar.setOverlaysWebView({ overlay: false }).catch((error) => {
    console.warn('[Native] Failed to configure status bar overlay:', error);
  });
  StatusBar.setStyle({ style: Style.Default }).catch((error) => {
    console.warn('[Native] Failed to configure status bar style:', error);
  });

  Keyboard.setResizeMode({ mode: KeyboardResize.Body }).catch((error) => {
    console.warn('[Native] Failed to configure keyboard resize:', error);
  });
  Keyboard.setStyle({ style: KeyboardStyle.Default }).catch((error) => {
    console.warn('[Native] Failed to configure keyboard style:', error);
  });

  Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
    document.documentElement.classList.add('native-keyboard-visible');
    document.documentElement.style.setProperty('--native-keyboard-height', `${keyboardHeight}px`);
  }).catch((error) => {
    console.warn('[Native] Failed to register keyboard show listener:', error);
  });

  Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.classList.remove('native-keyboard-visible');
    document.documentElement.style.setProperty('--native-keyboard-height', '0px');
  }).catch((error) => {
    console.warn('[Native] Failed to register keyboard hide listener:', error);
  });

  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    }
  }).catch((error) => {
    console.warn('[Native] Failed to register back button listener:', error);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest<HTMLAnchorElement>('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    let url: URL;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }

    if (!shouldOpenExternalUrl(url)) return;

    event.preventDefault();
    void openExternalUrl(url.toString()).catch((error) => {
      console.warn('[Native] Failed to open external URL:', error);
    });
  });

  document.addEventListener('pointerup', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('button, a, [role="button"], [data-native-haptic="true"]')) return;

    const now = Date.now();
    if (now - lastHapticAt < 120) return;
    lastHapticAt = now;

    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
      // Haptics are opportunistic; unsupported devices should continue silently.
    });
  }, { passive: true });
}
