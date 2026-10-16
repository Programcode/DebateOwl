export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return value;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let end = maxBytes; end > Math.max(0, maxBytes - 4); end -= 1) {
    try {
      return decoder.decode(encoded.subarray(0, end));
    } catch {
      // Move to the prior complete UTF-8 code point.
    }
  }
  return '';
}

function cleanGeneratedString(value: string) {
  return value
    .replace(/[—–]/g, ', ')
    .replace(/\b(Magnitude|Probability|Timeframe):\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanGeneratedOutput<T>(value: T): T {
  if (typeof value === 'string') return cleanGeneratedString(value) as T;
  if (Array.isArray(value)) return value.map(cleanGeneratedOutput) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cleanGeneratedOutput(child)])
    ) as T;
  }
  return value;
}
