import { Alert } from 'react-native';

/** A native alert with Cancel and a destructive action. Resolves true when the action is chosen. */
export function confirmDestructive(options: { title: string; message: string; confirm: string; cancel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(options.title, options.message, [
      { text: options.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: options.confirm, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** A native alert with one button, for a short outcome the student should notice. */
export function showNotice(title: string, message?: string) {
  Alert.alert(title, message);
}

/** iOS's text prompt. Resolves the entered text, or null when cancelled. */
export function promptText(options: { title: string; message: string; defaultValue: string; confirm: string; cancel: string }): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.prompt(options.title, options.message, [
      { text: options.cancel, style: 'cancel', onPress: () => resolve(null) },
      { text: options.confirm, onPress: (value?: string) => resolve(value ?? '') },
    ], 'plain-text', options.defaultValue);
  });
}
