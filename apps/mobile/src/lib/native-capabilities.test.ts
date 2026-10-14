import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  executionEnvironment: 'storeClient',
  modules: {} as Record<string, object>,
}));
const requireOptionalNativeModule = vi.hoisted(() => vi.fn((name: string) => env.modules[name] ?? null));

vi.mock('expo', () => ({ requireOptionalNativeModule }));
vi.mock('expo-constants', () => ({
  default: {
    get executionEnvironment() {
      return env.executionEnvironment;
    },
  },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

import { nativeCapabilities } from './native-capabilities';

describe('nativeCapabilities', () => {
  beforeEach(() => {
    requireOptionalNativeModule.mockClear();
  });

  it('reports nothing in Expo Go and never looks a native module up', () => {
    env.executionEnvironment = 'storeClient';
    // Even if a lookup would succeed, Expo Go must not be asked.
    env.modules = { ExpoSpeechRecognition: {}, ExpoWidgets: { widgetsDirectory: 'file:///group/ExpoWidgets/' } };
    expect(nativeCapabilities()).toEqual({ speechRecognition: false, liveActivity: false });
    expect(requireOptionalNativeModule).not.toHaveBeenCalled();
  });

  it('reports speech but no Live Activity in a development build without an App Group', () => {
    env.executionEnvironment = 'bare';
    env.modules = { ExpoSpeechRecognition: {}, ExpoWidgets: { widgetsDirectory: null } };
    expect(nativeCapabilities()).toEqual({ speechRecognition: true, liveActivity: false });
  });

  it('reports both when the build has the speech module and the App Group container', () => {
    env.executionEnvironment = 'bare';
    env.modules = { ExpoSpeechRecognition: {}, ExpoWidgets: { widgetsDirectory: 'file:///group/ExpoWidgets/' } };
    expect(nativeCapabilities()).toEqual({ speechRecognition: true, liveActivity: true });
  });

  it('reports nothing where the modules are missing, as in the web preview', () => {
    env.executionEnvironment = 'bare';
    env.modules = {};
    expect(nativeCapabilities()).toEqual({ speechRecognition: false, liveActivity: false });
  });
});
