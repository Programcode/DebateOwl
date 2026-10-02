type ArtifactSave = { requestId: string };

/**
 * Serializes autosaves of workspace artifacts. The RPC overwrites the row for a
 * request ID with whatever arrives, so concurrent saves could land out of order
 * and store older progress. This keeps one save in flight; while it runs, only
 * the newest payload per request ID waits, so a finished round's last save is
 * kept when the next round begins.
 */
export function createArtifactSaveQueue<T extends ArtifactSave>(
  save: (input: T) => Promise<unknown>,
  onError: (error: unknown) => void = (error) => console.error("Failed to save workspace artifact:", error),
) {
  const pending = new Map<string, T>();
  let saving = false;

  const drain = async () => {
    saving = true;
    while (pending.size > 0) {
      const [requestId, input] = pending.entries().next().value as [string, T];
      pending.delete(requestId);
      try {
        await save(input);
      } catch (error) {
        onError(error);
      }
    }
    saving = false;
  };

  return (input: T) => {
    pending.set(input.requestId, input);
    if (!saving) void drain();
  };
}
