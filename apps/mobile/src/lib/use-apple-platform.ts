import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { endLeftoverGeneratingActivities } from './generating-activity';
import { notificationHref } from './notification-routes';

/**
 * The iOS integrations that run for the whole app, from the root layout:
 * activities a previous launch left behind are ended, and a tapped
 * notification (a judged Sparring round, the timer's time-up alert) opens its
 * screen once the app is ready and signed in, including when the tap launched it.
 */
export function useApplePlatform(ready: boolean, userId: string | null) {
  const router = useRouter();

  useEffect(() => {
    endLeftoverGeneratingActivities();
  }, []);

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
