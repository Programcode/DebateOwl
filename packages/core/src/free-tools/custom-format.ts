/**
 * A coach's own round format and the limits it must fit. The website shares
 * one in a URL (`?custom=`, src/lib/free-tools/custom-format.ts); the app
 * keeps them on the device.
 */
import type { RoundFormat, RoundSegment, SegmentSide } from './formats';

export interface CustomSegment {
  label: string;
  seconds: number;
  /** Questioning periods have no points of information and no flow column. */
  kind: 'speech' | 'cross-examination';
  side: SegmentSide;
  /** Points of information between the first and last minute. */
  poi: boolean;
}

export interface CustomFormat {
  name: string;
  /** Prep time per side, in seconds. */
  prepSeconds: number;
  segments: CustomSegment[];
}

export const CUSTOM_LIMITS = {
  segments: 30,
  label: 40,
  name: 60,
  minSeconds: 10,
  maxSeconds: 60 * 60,
  maxPrepSeconds: 30 * 60,
  /** Encoded length; well under any browser's URL limit. */
  encoded: 4000,
} as const;

/** Control characters become spaces, runs of space collapse, and the result is cut to `max`. */
export function cleanText(value: string, max: number): string {
  const visible = Array.from(value, (char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char)).join('');
  return visible.replace(/\s+/g, ' ').trim().slice(0, max);
}

export const isWholeSeconds = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max;

/**
 * A custom format read back from storage, held to the same limits as a
 * shared link; null when anything does not fit. Text is cleaned, not refused.
 */
export function parseCustomFormat(value: unknown): CustomFormat | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, prepSeconds, segments } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !isWholeSeconds(prepSeconds, 0, CUSTOM_LIMITS.maxPrepSeconds)) return null;
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > CUSTOM_LIMITS.segments) return null;
  const parsed: CustomSegment[] = [];
  for (const entry of segments) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { label, seconds, kind, side, poi } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || !cleanText(label, CUSTOM_LIMITS.label)) return null;
    if (!isWholeSeconds(seconds, CUSTOM_LIMITS.minSeconds, CUSTOM_LIMITS.maxSeconds)) return null;
    if (kind !== 'speech' && kind !== 'cross-examination') return null;
    if (side !== 'a' && side !== 'b' && side !== 'both') return null;
    if (typeof poi !== 'boolean') return null;
    parsed.push({ label: cleanText(label, CUSTOM_LIMITS.label), seconds, kind, side, poi: poi && kind === 'speech' });
  }
  return { name: cleanText(name, CUSTOM_LIMITS.name) || 'Custom format', prepSeconds, segments: parsed };
}

/** The timer's view of a custom format. POI windows need at least a minute between the protected ends. */
export function customToRoundFormat(custom: CustomFormat): RoundFormat {
  const segments: RoundSegment[] = custom.segments.map((segment, index) => ({
    id: `c${index + 1}`,
    short: segment.label,
    label: segment.label,
    side: segment.side,
    kind: segment.kind,
    seconds: segment.seconds,
    ...(segment.poi && segment.kind === 'speech' && segment.seconds >= 180
      ? { poi: { opensAt: 60, closesAt: segment.seconds - 60 } }
      : {}),
  }));
  return {
    id: 'custom',
    name: custom.name,
    shortName: 'Custom',
    sideNames: ['Side A', 'Side B'],
    segments,
    prepSeconds: custom.prepSeconds,
    sources: [],
    note: 'A custom format. Share its link so your club times rounds the same way.',
  };
}

/** A starting point for editing: a built-in format as a custom one. */
export function roundFormatToCustom(format: RoundFormat): CustomFormat {
  return {
    name: `${format.name} (custom)`.slice(0, CUSTOM_LIMITS.name),
    prepSeconds: format.prepSeconds,
    segments: format.segments.map((segment) => ({
      label: segment.short.slice(0, CUSTOM_LIMITS.label),
      seconds: segment.seconds,
      kind: segment.kind === 'speech' || segment.kind === 'reply' ? 'speech' : 'cross-examination',
      side: segment.side,
      poi: Boolean(segment.poi),
    })),
  };
}
