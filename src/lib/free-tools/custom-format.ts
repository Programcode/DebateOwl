/**
 * A coach's own round format, small enough to share in a URL (`?custom=`).
 * The parameter is untrusted input: anything that does not fit the limits
 * below is rejected rather than repaired. The format itself is shared with
 * the app in @debatelab/core.
 */
import type { SegmentSide } from './formats';
import { cleanText, CUSTOM_LIMITS, isWholeSeconds, type CustomFormat, type CustomSegment } from '@debatelab/core/free-tools/custom-format';

export * from '@debatelab/core/free-tools/custom-format';

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

