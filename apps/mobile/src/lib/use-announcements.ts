import { filterVisibleAnnouncements, type UserAnnouncement } from '@debatelab/core/announcements';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { dismissAnnouncement, listActiveAnnouncements } from './announcements';
import { useAuth } from './auth';

/** The website reloads at most once a minute on navigation (ANNOUNCEMENTS_STALE_MS in AppLayout.tsx). */
const STALE_MS = 60_000;

export interface Announcements {
  /** The first visible announcement, shown one at a time as on the website. */
  announcement: UserAnnouncement | null;
  total: number;
  dismissing: boolean;
  dismissFailed: boolean;
  dismiss: () => void;
  /** Reloads unless the last load is under a minute old; the Debate tab calls it on focus. */
  refresh: () => void;
}

/**
 * The website's announcement banner state (AppLayout.tsx): the signed-in
 * account's active announcements, filtered by startsAt and expiresAt, reloaded
 * when the app comes to the foreground and on account change. Nothing from an
 * earlier account, or from before leaving, lands.
 */
export function useAnnouncements(): Announcements {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [items, setItems] = useState<UserAnnouncement[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const owner = useRef(userId);
  // Bumped on every owner change and on unmount, so work started before either never lands.
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const lastRequestAt = useRef<number | null>(null);
  // Dismissed here, so a load that started before the dismissal cannot bring it back.
  const dismissed = useRef(new Set<string>());

  const load = useCallback(async (force: boolean) => {
    if (!owner.current) return;
    const gen = generation.current;
    const requestedAt = Date.now();
    if (!force && lastRequestAt.current !== null && requestedAt - lastRequestAt.current < STALE_MS) {
      setItems((current) => filterVisibleAnnouncements(current, requestedAt));
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    lastRequestAt.current = requestedAt;
    try {
      const list = await listActiveAnnouncements(controller.signal);
      if (controller.signal.aborted || generation.current !== gen) return;
      setItems(filterVisibleAnnouncements(list.filter((item) => !dismissed.current.has(item.id)), Date.now()));
    } catch (cause) {
      if (controller.signal.aborted || generation.current !== gen || active.current !== controller) return;
      lastRequestAt.current = null;
      console.warn('Could not load announcements:', cause instanceof Error ? cause.message : cause);
      setItems([]);
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, []);

  useEffect(() => {
    owner.current = userId;
    generation.current += 1;
    active.current?.abort();
    active.current = null;
    lastRequestAt.current = null;
    dismissed.current.clear();
    setItems([]);
    setDismissingId(null);
    setFailedId(null);
    if (!userId) return;
    void load(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(false);
    });
    return () => {
      subscription.remove();
      generation.current += 1;
      active.current?.abort();
    };
  }, [userId, load]);

  // An announcement leaves the moment it expires, as on the website.
  useEffect(() => {
    const nextExpiry = Math.min(...items.map((item) => (item.expiresAt ? new Date(item.expiresAt).getTime() : Infinity)));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(
      () => setItems((current) => filterVisibleAnnouncements(current, Date.now())),
      Math.min(Math.max(0, nextExpiry - Date.now()), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [items]);

  const announcement = items[0] ?? null;

  const dismiss = useCallback(() => {
    if (!announcement) return;
    const id = announcement.id;
    const gen = generation.current;
    setDismissingId(id);
    setFailedId(null);
    void dismissAnnouncement(id)
      .then(() => {
        if (generation.current !== gen) return;
        dismissed.current.add(id);
        setItems((current) => current.filter((item) => item.id !== id));
      })
      .catch((cause: unknown) => {
        if (generation.current !== gen) return;
        console.warn('Could not dismiss the announcement:', cause instanceof Error ? cause.message : cause);
        setFailedId(id);
      })
      .finally(() => {
        if (generation.current === gen) setDismissingId((current) => (current === id ? null : current));
      });
  }, [announcement]);

  const refresh = useCallback(() => void load(false), [load]);

  return {
    announcement,
    total: items.length,
    dismissing: announcement !== null && dismissingId === announcement.id,
    dismissFailed: announcement !== null && failedId === announcement.id,
    dismiss,
    refresh,
  };
}
