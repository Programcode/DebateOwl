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
 * Sign-out removes the account's rows with that account's own access token,
 * which keeps working until it expires, so a registration still in flight
 * when the account signs out is removed as soon as it lands. The local record
 * is cleared only once the server removed the rows; if that fails, the next
 * account on this phone releases the token with release_push_token.
 *
 * - unavailable: this build cannot get an Expo push token. Expo Go on Android
 *   has no remote push since SDK 53, and every build needs the app's EAS
 *   project ID (`extra.eas.projectId` in app.json), which is not set yet.
 * - blocked: iOS Settings turned notifications off for the app.
 * - off / on: this account on this phone.
 */
export type PushState = 'unavailable' | 'blocked' | 'off' | 'on';

// The token this install registered, and for whom. `confirmed` stays false
// until the server confirms the first registration, so a registration whose
// answer never came is still known here and gets removed.
const REGISTRATION_KEY = 'debatelab.push-registration';
// How long sign-out waits; the removal itself carries on in the background.
const SIGN_OUT_WAIT_MS = 5_000;
// How long one round of push requests may run, so a hung call cannot hold the queue.
const REQUEST_BUDGET_MS = 20_000;

type Registration = { userId: string; token: string; confirmed: boolean };

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
    const { userId, token, confirmed } = value as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof token !== 'string') return null;
    // Builds before `confirmed` wrote the record only after the server confirmed it.
    return { userId, token, confirmed: confirmed !== false };
  } catch {
    return null;
  }
}

function writeRegistration(registration: Registration): Promise<void> {
  return AsyncStorage.setItem(REGISTRATION_KEY, JSON.stringify(registration));
}

/** Runs network work under one deadline, aborting its requests when it passes. */
async function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_BUDGET_MS);
  try {
    return await untilAborted(work(controller.signal), controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

/** The access token of the signed-in account, if it is still `userId`, so a request cannot run as the next account. */
async function accessTokenOf(userId: string, signal: AbortSignal): Promise<string> {
  const { data } = await untilAborted(supabase.auth.getSession(), signal);
  if (data.session?.user.id !== userId) throw new Error('The account changed before the request was sent.');
  return data.session.access_token;
}

async function register(userId: string, language: AppLanguage, signal: AbortSignal): Promise<void> {
  const token = (await untilAborted(Notifications.getExpoPushTokenAsync({ projectId: projectId() }), signal)).data;
  // register_push_token files the token under whoever sent the request; send it as this user.
  const accessToken = await accessTokenOf(userId, signal);
  const installationId = await untilAborted(getInstallId(), signal);
  const previous = await untilAborted(readRegistration(), signal);
  const confirmed = previous?.userId === userId && previous.confirmed;
  // Recorded before asking, so sign-out still removes the row if the answer is lost.
  await untilAborted(writeRegistration({ userId, token, confirmed }), signal);
  const { error } = await supabase
    .rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_locale: language,
      p_installation_id: installationId,
    })
    .setHeader('Authorization', `Bearer ${accessToken}`)
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  if (!confirmed) await untilAborted(writeRegistration({ userId, token, confirmed: true }), signal);
}

/**
 * Removes every row this install filed under the user, including one left by
 * an older token, then forgets the registration. RLS lets a user delete only
 * their own rows, so the request carries that user's access token.
 */
async function removeOwn(userId: string, accessToken: string, signal: AbortSignal): Promise<void> {
  const installationId = await untilAborted(getInstallId(), signal);
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('installation_id', installationId)
    .setHeader('Authorization', `Bearer ${accessToken}`)
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  await untilAborted(AsyncStorage.removeItem(REGISTRATION_KEY), signal);
}

/**
 * A registration left by another account means its removal on sign-out
 * failed. That account's token is gone, so this user releases the row with
 * release_push_token before doing anything else with push on this phone.
 */
async function releaseLeftover(userId: string, signal: AbortSignal): Promise<void> {
  const registration = await untilAborted(readRegistration(), signal);
  if (!registration || registration.userId === userId) return;
  const accessToken = await accessTokenOf(userId, signal);
  const { error } = await supabase
    .rpc('release_push_token', { p_token: registration.token })
    .setHeader('Authorization', `Bearer ${accessToken}`)
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  await untilAborted(AsyncStorage.removeItem(REGISTRATION_KEY), signal);
}

/** Queued behind any change in flight, so a read during a change reports where it ended. */
export function readPushState(userId: string): Promise<PushState> {
  return serial(async () => {
    if (!available()) return 'unavailable';
    const [permissions, registration] = await Promise.all([Notifications.getPermissionsAsync(), readRegistration()]);
    if (registration?.userId === userId && registration.confirmed) return allowed(permissions) ? 'on' : 'blocked';
    return !allowed(permissions) && !permissions.canAskAgain ? 'blocked' : 'off';
  });
}

/** Asks for permission if needed, then files the token under this user. */
export function enablePush(userId: string, language: AppLanguage): Promise<PushState> {
  return serial(async () => {
    if (!available()) return 'unavailable';
    // The iOS prompt waits for the user, so it stays outside the deadline.
    let permissions = await Notifications.getPermissionsAsync();
    if (!allowed(permissions) && permissions.canAskAgain) permissions = await Notifications.requestPermissionsAsync();
    if (!allowed(permissions)) return 'blocked';
    await withDeadline(async (signal) => {
      await releaseLeftover(userId, signal);
      await register(userId, language, signal);
    });
    return 'on';
  });
}

/** Stops this user's notifications on this phone. Throws if the rows could not be removed, so the switch stays on. */
export function disablePush(userId: string): Promise<void> {
  return serial(() =>
    withDeadline(async (signal) => {
      await releaseLeftover(userId, signal);
      await removeOwn(userId, await accessTokenOf(userId, signal), signal);
    }),
  );
}

/**
 * On launch and when the language changes: registers again, because Expo can
 * hand out a new token and the server writes in the token's language. It
 * first releases a token another account left behind, and removes a first
 * registration whose answer never came, since the switch showed it as off.
 */
export function refreshPush(userId: string, language: AppLanguage): Promise<void> {
  return serial(() =>
    withDeadline(async (signal) => {
      await releaseLeftover(userId, signal);
      const registration = await untilAborted(readRegistration(), signal);
      if (registration?.userId !== userId) return;
      if (!registration.confirmed) {
        await removeOwn(userId, await accessTokenOf(userId, signal), signal);
        return;
      }
      if (!available() || !allowed(await Notifications.getPermissionsAsync())) return;
      await register(userId, language, signal);
    }),
  );
}

/**
 * Called by sign-out with the account's access token, before the session is
 * removed, so the next person on this phone never gets this account's
 * notifications. The removal waits for a registration in flight and carries
 * on after sign-out returns: the access token stays valid until it expires.
 * Sign-out waits for it at most five seconds and this never throws. If the
 * removal fails, the registration stays recorded and the next account on this
 * phone releases the token (see releaseLeftover).
 */
export async function forgetPushOnSignOut(userId: string, accessToken: string): Promise<void> {
  const forget = serial(() =>
    withDeadline(async (signal) => {
      const registration = await untilAborted(readRegistration(), signal);
      if (registration?.userId === userId) await removeOwn(userId, accessToken, signal);
    }),
  ).catch((cause: unknown) => {
    console.warn('Could not remove the push token on sign-out:', cause instanceof Error ? cause.message : cause);
  });
  const wait = new AbortController();
  const timeout = setTimeout(() => wait.abort(), SIGN_OUT_WAIT_MS);
  try {
    await untilAborted(forget, wait.signal);
  } catch {
    // Still waiting for a registration in flight; the removal runs once it lands.
  } finally {
    clearTimeout(timeout);
  }
}
