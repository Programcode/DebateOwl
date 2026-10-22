/**
 * What an iPad split keeps open beside the main pane. The phone never uses
 * these: a source and a claim open in their own sheets there.
 */

/** A row open beside a list. A refresh that no longer has it closes the pane; a list that is still loading keeps it. */
export function openRowId(selectedId: string | null, rows: readonly { id: string }[] | null): string | null {
  if (!selectedId || rows === null) return selectedId;
  return rows.some((row) => row.id === selectedId) ? selectedId : null;
}

export interface PaneClaim {
  userId: string;
  scope: string;
  map: string;
}

/**
 * A docked claim stays open only while the same account, debate and map are on
 * screen. Switching maps clears it, so coming back does not reopen that card.
 */
export function openClaim<T extends PaneClaim>(
  claim: T | null,
  screen: { userId: string | null; scope: string | null; map: string | null },
): T | null {
  if (!claim) return null;
  if (claim.userId !== screen.userId || claim.scope !== screen.scope || claim.map !== screen.map) return null;
  return claim;
}
