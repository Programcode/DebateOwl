import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguage } from '@debatelab/core/languages';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { untilAborted } from './ai-request';
import { getInstallId } from './device-storage';
import { createSerialQueue } from './serial-queue';
import { supabase } from './supabase';

/**
 * Push notifications through the Expo push service. The server sends them
 * (supabase/functions/_shared/push.ts); this file asks for permission, files
 * the phone's Expo push token under the signed-in user with
 * register_push_token, and removes it again on sign-out.
 *
 * - unavailable: this build cannot get an Expo push token. Expo Go on Android
 *   has no remote push since SDK 53, and every build needs the app's EAS
 *   project ID (`extra.eas.projectId` in app.json), which is not set yet.
 * - blocked: iOS Settings turned notifications off for the app.
 * - off / on: this account on this phone.
 */
export type PushState = 'unavailable' | 'blocked' | 'off' | 'on';

// The token this install registered, and for whom. Only that user's session
// may remove the row, so a registration left by another account is dropped.
const REGISTRATION_KEY = 'debatelab.push-registration';
const SIGN_OUT_BUDGET_MS = 5_000;

type Registration = { userId: string; token: string };

// One change at a time, so sign-out's removal runs after a registration in
// flight instead of before it, and the next account never inherits the row.
const serial = createSerialQueue();

// Shown while the app is open too; without a handler iOS drops it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function projectId(): string | undefined {
  const fromConfig: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  return Constants.easConfig?.projectId ?? (typeof fromConfig === 'string' && fromConfig ? fromConfig : undefined);
}

function available(): boolean {
  return projectId() !== undefined && !(Platform.OS === 'android' && isRunningInExpoGo());
}

function allowed(permissions: Notifications.NotificationPermissionsStatus): boolean {
  return permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function readRegistration(): Promise<Registration | null> {
  try {
    const value: unknown = JSON.parse((await AsyncStorage.getItem(REGISTRATION_KEY)) ?? 'null');
    if (typeof value !== 'object' || value === null) return null;
    const { userId, token } = value as Record<string, unknown>;
    return typeof userId === 'string' && typeof token === 'string' ? { userId, token } : null;
  } catch {
    return null;
  }
}

async function register(userId: string, language: AppLanguage): Promise<void> {
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  // register_push_token files the token under whoever is signed in now; make sure that is still this user.
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error('The account changed before the phone was registered.');
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
    p_locale: language,
    p_installation_id: await getInstallId(),
  });
  if (error) throw new Error(error.message);
  await AsyncStorage.setItem(REGISTRATION_KEY, JSON.stringify({ userId, token } satisfies Registration));
}

/** Removes this phone's token row. RLS lets a user delete only their own rows. */
async function removeToken(registration: Registration, signal?: AbortSignal): Promise<void> {
  const query = supabase.from('push_tokens').delete().eq('token', registration.token).eq('user_id', registration.userId);
  const { error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw new Error(error.message);
}

/** Queued behind any change in flight, so a read during a change reports where it ended. */
export function readPushState(userId: string): Promise<PushState> {
  return serial(async () => {
    if (!available()) return 'unavailable';
    const [permissions, registration] = await Promise.all([Notifications.getPermissionsAsync(), readRegistration()]);
    if (registration?.userId === userId) return allowed(permissions) ? 'on' : 'blocked';
    return !allowed(permissions) && !permissions.canAskAgain ? 'blocked' : 'off';
  });
}

/** Asks for permission if needed, then files the token under this user. */
export function enablePush(userId: string, language: AppLanguage): Promise<PushState> {
  return serial(async () => {
    if (!available()) return 'unavailable';
    let permissions = await Notifications.getPermissionsAsync();
    if (!allowed(permissions) && permissions.canAskAgain) permissions = await Notifications.requestPermissionsAsync();
    if (!allowed(permissions)) return 'blocked';
    await register(userId, language);
    return 'on';
  });
}

/** Stops this user's notifications on this phone. Throws if the row could not be removed, so the switch stays on. */
export function disablePush(userId: string): Promise<void> {
  return serial(async () => {
    const registration = await readRegistration();
    if (registration?.userId === userId) await removeToken(registration);
    await AsyncStorage.removeItem(REGISTRATION_KEY);
  });
}

/**
 * On launch and when the language changes: registers again, because Expo can
 * hand out a new token and the server writes in the token's language. A
 * registration left by another account (its session ended without signing
 * out here) is forgotten; the next opt-in moves the token.
 */
export function refreshPush(userId: string, language: AppLanguage): Promise<void> {
  return serial(async () => {
    const registration = await readRegistration();
    if (!registration) return;
    if (registration.userId !== userId) {
      await AsyncStorage.removeItem(REGISTRATION_KEY);
      return;
    }
    if (!available() || !allowed(await Notifications.getPermissionsAsync())) return;
    await register(userId, language);
  });
}

/**
 * Called by sign-out while the session still works, so the next person on
 * this phone never gets this account's notifications. Never throws, and gives
 * up after five seconds so an offline sign-out still signs out.
 */
export async function forgetPushOnSignOut(userId: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIGN_OUT_BUDGET_MS);
  const forget = serial(async () => {
    try {
      const registration = await readRegistration();
      if (registration?.userId === userId) await removeToken(registration, controller.signal);
    } finally {
      await AsyncStorage.removeItem(REGISTRATION_KEY);
    }
  });
  try {
    await untilAborted(forget, controller.signal);
  } catch (cause) {
    console.warn('Could not remove the push token on sign-out:', cause instanceof Error ? cause.message : cause);
  } finally {
    clearTimeout(timeout);
  }
}
