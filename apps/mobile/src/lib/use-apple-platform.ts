import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { setReadyPushInstall } from './ai-request';
import { getInstallId } from './device-storage';
import { endLeftoverGeneratingActivities } from './generating-activity';
import { notificationHref } from './notification-routes';
import { deliverPending, startPurchaseListener } from './purchases';

/**
 * The iOS integrations that run for the whole app, from the root layout:
 * - activities a previous launch left behind are ended;
 * - App Store transactions (a renewal, an approved Ask to Buy, a redeemed
 *   offer code, a purchase the server has not confirmed yet) reach the
 *   signed-in account at launch, on sign-in, on every update and when the app
 *   comes back to the foreground (purchases.ts);
 * - a tapped notification (a judged Sparring round, the timer's time-up alert)
 *   opens its screen once the app is ready and signed in, including when the
 *   tap launched it.
 */
export function useApplePlatform(ready: boolean, userId: string | null) {
  const router = useRouter();

  useEffect(() => {
    endLeftoverGeneratingActivities();
    // A live run's "ready" push goes to this phone only (ai-request.ts).
    getInstallId()
      .then(setReadyPushInstall)
      .catch((cause: unknown) => console.warn('Could not read the install id:', cause instanceof Error ? cause.message : cause));
  }, []);

  const currentUser = useRef(userId);
  currentUser.current = userId;
  useEffect(() => startPurchaseListener(() => currentUser.current), []);
  useEffect(() => {
    if (!userId) return;
    deliverPending(userId).catch((cause: unknown) => console.warn('Could not deliver App Store purchases:', cause instanceof Error ? cause.message : cause));
  }, [userId]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !userId || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { request, date } = response.notification;
    const key = `${request.identifier}:${date}`;
    if (handled.current === key) return;
    handled.current = key;
    const href = notificationHref(request.content.data);
    if (href) router.push(href);
  }, [ready, response, router, userId]);
}
