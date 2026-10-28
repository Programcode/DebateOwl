import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// What the running binary can do beyond Expo Go. Autolinking puts these
// modules into every native build; DEBATELAB_BUILD=dev in app.config.ts adds
// what they need to work (the speech prompts, and with an App Group the
// widget extension). Quick actions and Spotlight need packages that are not
// installed yet; until they are, their modules are simply missing. Expo Go
// never has them, so it is not even asked: no import of a module that is
// missing, no crash.

export type NativeCapabilities = {
  /** expo-speech-recognition is linked. */
  speechRecognition: boolean;
  /** expo-widgets is linked and its App Group container exists, so a Live Activity can start. */
  liveActivity: boolean;
  /** The same container, so the Current Debate's Home Screen widget can be given its data (src/lib/debate-widget.ts). */
  widgets: boolean;
  /** expo-quick-actions is linked, so a Home Screen quick action reaches the app (src/lib/quick-actions.ts). */
  quickActions: boolean;
  /** expo-core-spotlight is linked, so debates and saved cases can be indexed (src/lib/spotlight.ts). */
  spotlight: boolean;
};

type WidgetsModule = { widgetsDirectory?: string | null };

export function nativeCapabilities(): NativeCapabilities {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { speechRecognition: false, liveActivity: false, widgets: false, quickActions: false, spotlight: false };
  }
  // expo-widgets links into every development build, but without the App
  // Group (DEBATELAB_APP_GROUP) it has no extension and no container.
  const widgets = requireOptionalNativeModule<WidgetsModule>('ExpoWidgets');
  const widgetContainer = !!widgets?.widgetsDirectory;
  return {
    speechRecognition: requireOptionalNativeModule('ExpoSpeechRecognition') != null,
    liveActivity: widgetContainer,
    widgets: widgetContainer,
    quickActions: requireOptionalNativeModule('ExpoQuickActions') != null,
    spotlight: requireOptionalNativeModule('ExpoCoreSpotlight') != null,
  };
}
