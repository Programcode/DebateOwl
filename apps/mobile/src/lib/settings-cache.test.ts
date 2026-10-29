import { beforeEach, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
  multiSet: async (pairs: [string, string][]) => { for (const [key, value] of pairs) storage.set(key, value); },
} }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { keepSettingsCopy, preloadSettingsCopy, readSettingsCopy } from './settings-cache';

beforeEach(() => { storage.clear(); vi.clearAllMocks(); });

it('starts the disk read before auth resolves and reuses it only for its confirmed account', async () => {
  await keepSettingsCopy('a', 'A settings');
  const preloaded = preloadSettingsCopy();
  expect(AsyncStorage.getItem).toHaveBeenCalledWith('debatelab.settings.owner');
  await preloaded;
  vi.mocked(AsyncStorage.getItem).mockClear();
  expect(await readSettingsCopy('a', preloaded)).toBe('A settings');
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
});

it('never returns the last account settings to another account', async () => {
  await keepSettingsCopy('a', 'A settings');
  storage.set('debatelab.settings.b', 'B settings');
  const preloaded = preloadSettingsCopy();
  expect(await readSettingsCopy('b', preloaded)).toBe('B settings');
  expect(await readSettingsCopy('c', preloaded)).toBeNull();
});
