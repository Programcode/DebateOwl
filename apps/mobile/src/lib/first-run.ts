import AsyncStorage from '@react-native-async-storage/async-storage';

// The website's keys (src/lib/debateowl-intro.ts, src/hooks/use-onboarding.ts):
// the welcome opens once per device, the tour once per account on the device.
const INTRO_SEEN_KEY = 'debateowl_intro_seen_v1';
const TOUR_DONE_KEY = 'debateowl.tour.completedUserIds';

export interface FirstRunPlan {
  showIntro: boolean;
  tourDone: boolean;
}

async function tourDoneIds(): Promise<string[]> {
  const value: unknown = JSON.parse((await AsyncStorage.getItem(TOUR_DONE_KEY)) ?? '[]');
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * What the first run shows for this account on this phone. Storage that cannot
 * be read keeps both closed, as on the website: a flag that cannot be saved
 * would reopen them on every launch.
 */
export async function firstRunPlan(userId: string): Promise<FirstRunPlan> {
  try {
    const [intro, done] = await Promise.all([AsyncStorage.getItem(INTRO_SEEN_KEY), tourDoneIds()]);
    return { showIntro: intro === null, tourDone: done.includes(userId) };
  } catch {
    return { showIntro: false, tourDone: true };
  }
}

export async function markIntroSeen(now = new Date()): Promise<void> {
  await AsyncStorage.setItem(INTRO_SEEN_KEY, now.toISOString()).catch(() => undefined);
}

export async function markTourDone(userId: string): Promise<void> {
  try {
    const done = await tourDoneIds();
    if (!done.includes(userId)) await AsyncStorage.setItem(TOUR_DONE_KEY, JSON.stringify([...done, userId]));
  } catch {
    // Not saved: the tour opens once more on the next launch.
  }
}
