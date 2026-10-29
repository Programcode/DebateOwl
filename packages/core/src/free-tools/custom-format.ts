/**
 * A coach's own round format and the limits it must fit. The website shares
 * one in a URL (`?custom=`); the app uses the same codec and keeps formats
 * on the device.
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

type WireSegment = [label: string, seconds: number, kind: 's' | 'q', side: SegmentSide, poi: 0 | 1];
interface Wire { v: 1; n: string; p: number; s: WireSegment[] }

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeCustomFormat(format: CustomFormat): string {
  const wire: Wire = {
    v: 1,
    n: format.name,
    p: format.prepSeconds,
    s: format.segments.map((segment) => [segment.label, segment.seconds, segment.kind === 'speech' ? 's' : 'q', segment.side, segment.poi ? 1 : 0]),
  };
  return toBase64Url(JSON.stringify(wire));
}

/** The custom format in a `?custom=` value, or null when it is malformed or out of bounds. */
export function decodeCustomFormat(value: string | null | undefined): CustomFormat | null {
  if (!value || value.length > CUSTOM_LIMITS.encoded || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  let wire: unknown;
  try {
    wire = JSON.parse(fromBase64Url(value));
  } catch {
    return null;
  }
  if (typeof wire !== 'object' || wire === null) return null;
  const { v, n, p, s } = wire as Record<string, unknown>;
  if (v !== 1 || typeof n !== 'string' || !isWholeSeconds(p, 0, CUSTOM_LIMITS.maxPrepSeconds)) return null;
  if (!Array.isArray(s) || s.length === 0 || s.length > CUSTOM_LIMITS.segments) return null;
  const segments: CustomSegment[] = [];
  for (const entry of s) {
    if (!Array.isArray(entry) || entry.length !== 5) return null;
    const [label, seconds, kind, side, poi] = entry as unknown[];
    if (typeof label !== 'string' || !cleanText(label, CUSTOM_LIMITS.label)) return null;
    if (!isWholeSeconds(seconds, CUSTOM_LIMITS.minSeconds, CUSTOM_LIMITS.maxSeconds)) return null;
    if (kind !== 's' && kind !== 'q') return null;
    if (side !== 'a' && side !== 'b' && side !== 'both') return null;
    if (poi !== 0 && poi !== 1) return null;
    segments.push({ label: cleanText(label, CUSTOM_LIMITS.label), seconds, kind: kind === 's' ? 'speech' : 'cross-examination', side, poi: poi === 1 && kind === 's' });
  }
  return { name: cleanText(n, CUSTOM_LIMITS.name) || 'Custom format', prepSeconds: p, segments };
}
