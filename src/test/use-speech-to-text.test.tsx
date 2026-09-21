import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockState, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({ supabase: supabaseMock }));

import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { useSettingsStore } from '@/lib/stores/settings-store';

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onresult = vi.fn();
  onerror = vi.fn();
  onend = vi.fn();
}

const instances: MockSpeechRecognition[] = [];

class SpeechRecognitionConstructor extends MockSpeechRecognition {
  constructor() {
    super();
    instances.push(this);
  }
}

describe('useSpeechToText locale', () => {
  beforeEach(() => {
    resetMockState();
    instances.length = 0;
    useSettingsStore.setState({ language: 'en' });
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      writable: true,
      value: SpeechRecognitionConstructor,
    });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('uses hu-HU when Hungarian is active at mount', async () => {
    useSettingsStore.setState({ language: 'hu' });
    renderHook(() => useSpeechToText());

    await waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0].lang).toBe('hu-HU');
  });

  it('recreates recognition with hu-HU after the language changes', async () => {
    const { unmount } = renderHook(() => useSpeechToText());
    await waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0].lang).toBe('en-GB');

    act(() => useSettingsStore.setState({ language: 'hu' }));

    await waitFor(() => expect(instances).toHaveLength(2));
    expect(instances[0].abort).toHaveBeenCalledOnce();
    expect(instances[1].lang).toBe('hu-HU');
    unmount();
    expect(instances[1].abort).toHaveBeenCalledOnce();
  });

  it('reports unsupported browsers without constructing recognition', () => {
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined });
    const { result } = renderHook(() => useSpeechToText());

    expect(result.current.hasSupport).toBe(false);
    expect(instances).toHaveLength(0);
  });
});
