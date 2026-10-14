/**
 * What the app remembers for the session outside React: the last Generate and
 * Attack forms and the results made in this session. It belongs to the
 * signed-in account and is forgotten whenever the account changes, including
 * signing out, so the next account never sees it.
 */

const resets = new Set<() => void>();
let owner: string | null = null;

/** A value that starts from `initial()` again for every account. */
export function sessionSlot<T>(initial: () => T): { get: () => T; set: (value: T) => void } {
  let value = initial();
  resets.add(() => {
    value = initial();
  });
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

/** Called by the auth provider before it adopts a session, so no screen renders with the previous account's memory. */
export function setSessionOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  resets.forEach((reset) => reset());
}

/** Forgets the session memory of the account still signed in, as after Delete all my data. */
export function forgetSessionMemory() {
  resets.forEach((reset) => reset());
}
