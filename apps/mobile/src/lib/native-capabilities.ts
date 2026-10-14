import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// What the running binary can do beyond Expo Go. A development build links
// these modules only when app.config.ts ran with DEBATELAB_BUILD=dev, and
// Expo Go never has them, so it is not even asked: no import of a module
// that is missing, no crash.

export type NativeCapabilities = {
  /** expo-speech-recognition is linked. */
  speechRecognition: boolean;
  /** expo-widgets is linked and its App Group container exists, so a Live Activity can start. */
  liveActivity: boolean;
};

type WidgetsModule = { widgetsDirectory?: string | null };

export function nativeCapabilities(): NativeCapabilities {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { speechRecognition: false, liveActivity: false };
  }
  // expo-widgets links into every development build, but without the App
  // Group (DEBATELAB_APP_GROUP) it has no extension and no container.
  const widgets = requireOptionalNativeModule<WidgetsModule>('ExpoWidgets');
  return {
    speechRecognition: requireOptionalNativeModule('ExpoSpeechRecognition') != null,
    liveActivity: !!widgets?.widgetsDirectory,
  };
}
