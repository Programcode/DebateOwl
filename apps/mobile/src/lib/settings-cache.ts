import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_OWNER = 'debatelab.settings.owner';
const cacheKey = (userId: string) => `debatelab.settings.${userId}`;
type SettingsCopy = { userId: string; raw: string | null };

/** Start alongside auth restore, but do not apply anything until auth confirms the owner. */
export async function preloadSettingsCopy(): Promise<SettingsCopy | null> {
  try {
    const userId = await AsyncStorage.getItem(LAST_OWNER);
    return userId ? { userId, raw: await AsyncStorage.getItem(cacheKey(userId)) } : null;
  } catch {
    return null;
  }
}

export async function readSettingsCopy(userId: string, preloaded?: Promise<SettingsCopy | null> | null): Promise<string | null> {
  const copy = preloaded ? await preloaded : null;
  return copy?.userId === userId ? copy.raw : AsyncStorage.getItem(cacheKey(userId));
}

export function keepSettingsCopy(userId: string, raw: string): Promise<void> {
  return AsyncStorage.multiSet([[cacheKey(userId), raw], [LAST_OWNER, userId]]);
}
