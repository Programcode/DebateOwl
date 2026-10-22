export type AccountPresence = "present" | "missing" | "unknown";

/**
 * A checkout can finish after the account is gone. Only an explicit
 * not-found is safe to treat as deleted; anything else should retry.
 */
export function accountPresence(lookup: {
  user: unknown;
  errorStatus?: number | null;
  errorMessage?: string | null;
}): AccountPresence {
  if (lookup.user) return "present";
  const message = lookup.errorMessage ?? "";
  if (lookup.errorStatus === 404 || /not found/i.test(message)) return "missing";
  return "unknown";
}
