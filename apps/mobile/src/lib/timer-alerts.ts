import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';

import { timerAlertAt, type TimerSession } from './timer';

/**
 * Time up while the app is away. The timer's own signals (timer-signals.ts)
 * need the app running, and iOS suspends it a few seconds after the phone
 * locks, so a speech or prep bank that runs out on a locked phone would pass
 * in silence. When the app leaves the screen with a clock running, a local
 * notification is set for the moment it runs out, with sound unless the timer
 * is muted; coming back, or any change to the round, takes it away again.
 * Local notifications need no server and work in Expo Go.
 *
 * It is marked time-sensitive, so it can break through a Focus. That needs the
 * Time Sensitive Notifications capability on the App ID; without it iOS
 * delivers it as an ordinary notification.
 */

const ALERT_ID = 'debateowl-timer-up';
const ASKED_KEY = 'debateowl.timer-alerts-asked';

/**
 * Asks for notification permission the first time the student starts a clock,
 * which is when the reason is plain. Asked once per install; afterwards iOS
 * Settings decides.
 */
export async function askForTimerAlerts(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'undetermined') return;
    await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  } catch (cause) {
    console.warn('Could not ask for timer alerts:', cause instanceof Error ? cause.message : cause);
  }
}

async function allowed(): Promise<boolean> {
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Keeps the time-up alert in step with the round and with whether the app is on screen. Used by TimerRunner. */
export function useTimerAlerts(session: TimerSession, loaded: boolean) {
  const { t } = useTranslation();
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        await Notifications.cancelScheduledNotificationAsync(ALERT_ID);
        // On screen the timer sounds its own signals.
        if (appState === 'active' || cancelled) return;
        const alert = timerAlertAt(session, Date.now());
        if (!alert || !(await allowed()) || cancelled) return;
        const content =
          alert.kind === 'prep'
            ? { title: t('mobile.timerAlert.prepTitle'), body: t('mobile.timerAlert.prepBody') }
            : { title: t('mobile.timerAlert.speechTitle', { speech: alert.segment.short }), body: t('mobile.timerAlert.speechBody', { speech: alert.segment.label }) };
        await Notifications.scheduleNotificationAsync({
          identifier: ALERT_ID,
          content: {
            ...content,
            sound: session.muted ? false : 'default',
            interruptionLevel: 'timeSensitive',
            data: { kind: 'timer' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(alert.at) },
        });
      } catch (cause) {
        console.warn('Could not set the time-up alert:', cause instanceof Error ? cause.message : cause);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appState, loaded, session, t]);
}
