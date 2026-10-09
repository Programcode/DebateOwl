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
