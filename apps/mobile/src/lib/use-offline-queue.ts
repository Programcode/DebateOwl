import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useToast } from '@/components/toast';
import { useAuth } from './auth';
import { useOfflineStatus } from './network-status';
import {
  getQueueSnapshot,
  replayOfflineQueue,
  setQueueOwner,
  subscribeQueue,
  subscribeQueueReports,
  subscribeStorageTrouble,
  waitingCount,
  type QueueSnapshot,
} from './offline-queue';

/** How often a queue that still waits tries again while the device says it is online (a captive portal, a server that did not answer). */
const RETRY_MS = 30_000;

const EMPTY: QueueSnapshot = { owner: null, items: [], synced: new Map() };

/** The offline queue of this account, for drawing queued changes; empty for any other account. */
export function useQueuedWrites(userId: string | null): QueueSnapshot {
  const state = useSyncExternalStore(subscribeQueue, getQueueSnapshot, getQueueSnapshot);
  return userId && state.owner === userId ? state : EMPTY;
}

/**
 * Runs the offline queue for the signed-in account: names its owner once auth
 * has settled (another account's queue is removed), sends it on launch, when
 * the connection returns and when the app comes to the foreground, and says in
 * one toast what a replay saved or what the server refused.
 * Call it once, in the root layout, inside AuthProvider and ToastProvider.
 */
export function useOfflineQueue(): void {
  const { t } = useTranslation();
  const toast = useToast();
  const { session, loading } = useAuth();
  const { offline } = useOfflineStatus();
  const userId = session?.user.id ?? null;
  const queued = useQueuedWrites(userId);
  const waiting = waitingCount(queued) > 0;

  // The stored session is read before auth settles; until then the account is unknown, not signed out.
  useEffect(() => {
    if (loading) return;
    setQueueOwner(userId);
    if (userId) void replayOfflineQueue();
  }, [loading, userId]);

  useEffect(() => {
    if (!loading && userId && !offline) void replayOfflineQueue();
  }, [loading, userId, offline]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void replayOfflineQueue();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!waiting || offline) return;
    const timer = setInterval(() => void replayOfflineQueue(), RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, offline]);

  useEffect(
    () =>
      subscribeQueueReports(({ synced, dropped }) => {
        if (dropped.length > 0) {
          const [first] = dropped;
          const message = dropped.length === 1 && first.kind === 'add' && first.title
            ? t('mobile.offlineQueue.noteRefused', { title: first.title })
            : t('mobile.offlineQueue.refusedDesc', { count: dropped.length });
          toast({ tone: 'error', title: t('mobile.offlineQueue.refusedTitle', { count: dropped.length }), message });
          return;
        }
        if (synced > 0) toast({ tone: 'success', title: t('mobile.offlineQueue.synced', { count: synced }) });
      }),
    [t, toast],
  );

  // The phone could not store the queue: changes still sync while the app stays open.
  useEffect(
    () =>
      subscribeStorageTrouble(() =>
        toast({ tone: 'error', title: t('mobile.offlineQueue.notKeptTitle'), message: t('mobile.offlineQueue.notKeptDesc') }),
      ),
    [t, toast],
  );
}
