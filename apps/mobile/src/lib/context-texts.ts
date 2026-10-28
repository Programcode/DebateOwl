import { sessionSlot } from './session-memory';

/**
 * The text of debate material the context plan has read (a source's content,
 * a result's output, a chat's messages, a round's scorecard), kept for the
 * session under the version the list read reported for the row, so a changed
 * row is read again. Writes in the app also forget their row here. Kept apart
 * from context-plan.ts so the modules that write rows need no React.
 */

/** A row that was gone when its text was read: the plan leaves it out. */
export const GONE = Symbol('gone');

interface KeptText {
  version: string;
  value: unknown;
}

const texts = sessionSlot(() => new Map<string, KeptText>());
const listeners = new Set<() => void>();

const entry = (debateId: string, key: string) => `${debateId}|${key}`;

/** The kept text of `key` (`source:<id>` or `<kind>:<id>`), if it was read at this version. */
export function keptText(debateId: string, key: string, version: string): { value: unknown } | undefined {
  const kept = texts.get().get(entry(debateId, key));
  return kept && kept.version === version ? { value: kept.value } : undefined;
}

export function keepText(debateId: string, key: string, version: string, value: unknown) {
  texts.get().set(entry(debateId, key), { version, value });
}

/** Forgets a row's text in every debate, after the app changed the row. */
export function forgetText(key: string) {
  let forgot = false;
  for (const name of texts.get().keys()) {
    if (name.endsWith(`|${key}`)) {
      texts.get().delete(name);
      forgot = true;
    }
  }
  if (forgot) listeners.forEach((listener) => listener());
}

/** Called when a write forgets text, so a plan on screen reads it again. */
export function onTextForgotten(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
