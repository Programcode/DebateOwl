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

export { cleanGeneratedOutput } from '@debatelab/core/ai/generate-output';
