import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguage } from '@debatelab/core/languages';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
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
 * Every registration carries the ID of the local registration record, and
 * release_push_token withdraws that ID and deletes only the rows it wrote. The
 * server refuses a registration whose ID was withdrawn, so a registration the
 * app gave up on cannot land after the release: cancelling a request does not
 * cancel its database statement. Once a release is sent for an ID, the next
 * registration gets a new one, so a release that arrives late never deletes a
 * newer registration's row. Sign-out releases with that account's own access
 * token, which keeps working until it expires. The local record is cleared
 * only once a release succeeded; until then the next change on this phone
 * releases it again before doing anything else with push.
 *
 * - unavailable: this build cannot get an Expo push token. Expo Go on Android
 *   has no remote push since SDK 53, and every build needs the app's EAS
 *   project ID (`extra.eas.projectId` in app.config.ts), which is not set yet.
 * - blocked: iOS Settings turned notifications off for the app.
 * - off / on: this account on this phone.
 */
export type PushState = 'unavailable' | 'blocked' | 'off' | 'on';

// The token this install registered, for whom, and the registration's ID.
// `confirmed` stays false until the server confirms the first registration,
// so a registration whose answer never came is still known here and gets
// released. `released` is set before a release is sent and the ID is never
// registered again after it.
const REGISTRATION_KEY = 'debatelab.push-registration';
// register_push_token's error for a registration whose ID was released.
const WITHDRAWN = '55000';
// How long sign-out waits; the release itself carries on in the background.
const SIGN_OUT_WAIT_MS = 5_000;
// How long one round of push requests may run, so a hung call cannot hold the queue.
const REQUEST_BUDGET_MS = 20_000;

type Registration = { userId: string; token: string; id: string; confirmed: boolean; released: boolean };

// One change at a time, so sign-out's release runs after a registration in
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
    const { userId, token, id, confirmed, released } = value as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof token !== 'string' || typeof id !== 'string') return null;
    return { userId, token, id, confirmed: confirmed === true, released: released === true };
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
  // Callers release any other registration first, so one recorded here is this user's own and was never released.
  const previous = await untilAborted(readRegistration(), signal);
  const registration =
    previous?.userId === userId
      ? { ...previous, token }
      : { userId, token, id: Crypto.randomUUID(), confirmed: false, released: false };
  // Recorded before asking, so a release withdraws this registration even if its answer is lost.
  await untilAborted(writeRegistration(registration), signal);
  const { error } = await supabase
    .rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_locale: language,
      p_installation_id: installationId,
      p_registration: registration.id,
    })
    .setHeader('Authorization', `Bearer ${accessToken}`)
    .abortSignal(signal);
  // A release went through but its answer was lost, so this registration is already off.
  if (error?.code === WITHDRAWN) await untilAborted(AsyncStorage.removeItem(REGISTRATION_KEY), signal);
  if (error) throw new Error(error.message);
  if (!registration.confirmed) await untilAborted(writeRegistration({ ...registration, confirmed: true }), signal);
}

/**
 * Withdraws the registration recorded here, whoever made it, and deletes the
 * rows it wrote, then forgets it. Any signed-in account may release: the
 * registration ID is the proof.
 */
async function release(accessToken: string, signal: AbortSignal): Promise<void> {
  const registration = await untilAborted(readRegistration(), signal);
  const installationId = await untilAborted(getInstallId(), signal);
  // Marked before sending: this release may still arrive after a newer registration, so that one needs a new ID.
  if (registration && !registration.released) await untilAborted(writeRegistration({ ...registration, released: true }), signal);
  const { error } = await supabase
    .rpc('release_push_token', {
      p_installation_id: installationId,
      p_registration: registration?.id ?? null,
    })
    .setHeader('Authorization', `Bearer ${accessToken}`)
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  await untilAborted(AsyncStorage.removeItem(REGISTRATION_KEY), signal);
}

/**
 * Before anything else with push on this phone, releases a registration this
 * user should not hold: one another account left because its release on
 * sign-out failed, a first registration of this user's whose answer never
 * came, since the switch showed it as off, or one whose release was sent but
 * not confirmed.
 */
async function releaseStale(userId: string, signal: AbortSignal): Promise<void> {
  const registration = await untilAborted(readRegistration(), signal);
  if (!registration || (registration.userId === userId && registration.confirmed && !registration.released)) return;
  await release(await accessTokenOf(userId, signal), signal);
}

/** Queued behind any change in flight, so a read during a change reports where it ended. */
export function readPushState(userId: string): Promise<PushState> {
  return serial(async () => {
    if (!available()) return 'unavailable';
    const [permissions, registration] = await Promise.all([Notifications.getPermissionsAsync(), readRegistration()]);
    if (registration?.userId === userId && registration.confirmed && !registration.released) {
      return allowed(permissions) ? 'on' : 'blocked';
    }
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
      await releaseStale(userId, signal);
      await register(userId, language, signal);
    });
    return 'on';
  });
}

/** Stops this user's notifications on this phone. Throws if the rows could not be removed, so the switch stays on. */
export function disablePush(userId: string): Promise<void> {
  return serial(() => withDeadline(async (signal) => release(await accessTokenOf(userId, signal), signal)));
}

/**
 * On launch and when the language changes: registers again, because Expo can
 * hand out a new token and the server writes in the token's language. It
 * first releases a registration this user should not hold (see releaseStale).
 */
export function refreshPush(userId: string, language: AppLanguage): Promise<void> {
  return serial(() =>
    withDeadline(async (signal) => {
      await releaseStale(userId, signal);
      const registration = await untilAborted(readRegistration(), signal);
      if (registration?.userId !== userId) return;
      if (!available() || !allowed(await Notifications.getPermissionsAsync())) return;
      await register(userId, language, signal);
    }),
  );
}

/**
 * Called by sign-out with the account's access token, before the session is
 * removed, so the next person on this phone never gets this account's
 * notifications. The release waits for a registration in flight and carries
 * on after sign-out returns: the access token stays valid until it expires.
 * Sign-out waits for it at most five seconds and this never throws. If the
 * release fails, the registration stays recorded and the next account on this
 * phone releases it (see releaseStale).
 */
export async function forgetPushOnSignOut(userId: string, accessToken: string): Promise<void> {
  const forget = serial(() =>
    withDeadline(async (signal) => {
      const registration = await untilAborted(readRegistration(), signal);
      if (registration?.userId === userId) await release(accessToken, signal);
    }),
  ).catch((cause: unknown) => {
    console.warn('Could not release the push token on sign-out:', cause instanceof Error ? cause.message : cause);
  });
  const wait = new AbortController();
  const timeout = setTimeout(() => wait.abort(), SIGN_OUT_WAIT_MS);
  try {
    await untilAborted(forget, wait.signal);
  } catch {
    // Still waiting for a registration in flight; the release runs once it lands.
  } finally {
    clearTimeout(timeout);
  }
}
