import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useSyncExternalStore } from 'react';

/**
 * Whether the app is reading saved copies instead of the network. expo-network
 * says when the device is offline; a read that fell back to a saved copy says
 * so too, which covers a network that is up but cannot reach the server. The
 * next read that reaches the server clears that.
 */

export interface OfflineStatus {
  /** expo-network reports no connection. */
  offline: boolean;
  /** The last read was answered from a saved copy. */
  savedCopies: boolean;
}

let status: OfflineStatus = { offline: false, savedCopies: false };
const listeners = new Set<() => void>();

function update(patch: Partial<OfflineStatus>) {
  const next = { ...status, ...patch };
  if (next.offline === status.offline && next.savedCopies === status.savedCopies) return;
  status = next;
  listeners.forEach((listener) => listener());
}

// iOS reports isInternetReachable as null until it knows; only a definite false means offline.
function isOffline(state: NetworkState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

export function isKnownOffline(): boolean {
  return status.offline;
}

export function noteSavedCopy() {
  update({ savedCopies: true });
}

export function noteNetworkRead() {
  update({ savedCopies: false });
}

/** Follows the device's connection until the returned function is called. */
export function watchNetwork(): () => void {
  let active = true;
  const subscription = addNetworkStateListener((state) => update({ offline: isOffline(state) }));
  getNetworkStateAsync()
    .then((state) => {
      if (active) update({ offline: isOffline(state) });
    })
    .catch((cause: unknown) => console.warn('Could not read the network state:', cause instanceof Error ? cause.message : cause));
  return () => {
    active = false;
    subscription.remove();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOfflineStatus(): OfflineStatus {
  return useSyncExternalStore(subscribe, () => status, () => status);
}
