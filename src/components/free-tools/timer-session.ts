/**
 * Where the free timer's format and round come from: the URL first (a shared
 * link wins), then what this browser stored, then Public Forum.
 */
import { FORMATS, isBuiltInFormatId, type BuiltInFormatId, type RoundFormat } from '@/lib/free-tools/formats';
import { customToRoundFormat, decodeCustomFormat, encodeCustomFormat, type CustomFormat } from '@/lib/free-tools/custom-format';
import { initialRoundState, parseRoundState, type RoundState } from '@/lib/free-tools/round-timer';

export type FormatChoice = { id: BuiltInFormatId } | { id: 'custom'; custom: CustomFormat };

export interface TimerSession {
  choice: FormatChoice;
  round: RoundState;
  muted: boolean;
}

export function formatFor(choice: FormatChoice): RoundFormat {
  return choice.id === 'custom' ? customToRoundFormat(choice.custom) : FORMATS[choice.id];
}

const sameChoice = (a: FormatChoice, b: FormatChoice) =>
  a.id === b.id && (a.id !== 'custom' || (b.id === 'custom' && encodeCustomFormat(a.custom) === encodeCustomFormat(b.custom)));

/** The format a URL asks for, if any. */
export function choiceFromSearch(search: string): FormatChoice | null {
  const params = new URLSearchParams(search);
  const custom = decodeCustomFormat(params.get('custom'));
  if (custom && (params.get('format') ?? 'custom') === 'custom') return { id: 'custom', custom };
  const format = params.get('format');
  return isBuiltInFormatId(format) ? { id: format } : null;
}

export function searchForChoice(choice: FormatChoice): string {
  const params = new URLSearchParams({ format: choice.id });
  if (choice.id === 'custom') params.set('custom', encodeCustomFormat(choice.custom));
  return `?${params}`;
}

function readStored(storageKey: string): TimerSession | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const { format, custom, round, muted } = raw as Record<string, unknown>;
    const choice: FormatChoice | null = format === 'custom'
      ? (typeof custom === 'string' && decodeCustomFormat(custom) ? { id: 'custom', custom: decodeCustomFormat(custom)! } : null)
      : (isBuiltInFormatId(typeof format === 'string' ? format : null) ? { id: format as BuiltInFormatId } : null);
    if (!choice) return null;
    const parsed = parseRoundState(round, formatFor(choice));
    return parsed ? { choice, round: parsed, muted: muted === true } : null;
  } catch {
    return null;
  }
}

export function storeSession(storageKey: string, session: TimerSession): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      format: session.choice.id,
      ...(session.choice.id === 'custom' ? { custom: encodeCustomFormat(session.choice.custom) } : {}),
      round: session.round,
      muted: session.muted,
    }));
  } catch {
    // Private mode or a full quota: the timer works, it just won't survive a reload.
  }
}

/** The session to open with. During prerendering there is no window, and the page shows Public Forum. */
export function initialSession(storageKey: string, fallback: BuiltInFormatId = 'pf'): TimerSession {
  if (typeof window === 'undefined') return { choice: { id: fallback }, round: initialRoundState(FORMATS[fallback]), muted: false };
  const fromUrl = choiceFromSearch(window.location.search);
  const stored = readStored(storageKey);
  if (stored && (!fromUrl || sameChoice(fromUrl, stored.choice))) return stored;
  const choice = fromUrl ?? { id: fallback };
  return { choice, round: initialRoundState(formatFor(choice)), muted: stored?.muted ?? false };
}
