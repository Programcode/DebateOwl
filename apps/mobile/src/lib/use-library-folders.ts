import { GENERAL_FOLDER } from '@debatelab/core/library';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { fetchFolders, subscribeSourcesChanged } from './sources';

/** One debate's folders, as the Library lists them; reloads when sources or folders change. General until they load. */
export function useLibraryFolders(debateId: string | null): { folders: string[]; reload: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [folders, setFolders] = useState<string[]>([GENERAL_FOLDER]);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => subscribeSourcesChanged(reload), [reload]);
  useEffect(() => {
    if (!userId || !debateId) return;
    let active = true;
    fetchFolders(userId, debateId)
      .then((next) => {
        if (active) setFolders(next);
      })
      .catch((cause: unknown) => console.warn('Could not load folders:', cause instanceof Error ? cause.message : cause));
    return () => {
      active = false;
    };
  }, [userId, debateId, tick]);

  return { folders, reload };
}
