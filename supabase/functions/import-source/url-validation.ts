// SSRF-safe URL validation helpers for the import-source edge function.
// Exported separately from index.ts so they can be unit-tested without
// invoking Deno.serve at module load.

export function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function isPrivateIpv6(hostname: string) {
  // Deno's URL parser strips brackets from `hostname`. Lowercase and trim "%zone".
  const h = hostname.toLowerCase().replace(/%.*$/, "");
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1" || h === "0:0:0:0:0:0:0:0") return true;
  // Unique-local fc00::/7 (fc__ or fd__) and link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  // IPv4-mapped IPv6 (::ffff:x.y.z.w)
  const v4MappedMatch = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch && isPrivateIpv4(v4MappedMatch[1])) return true;
  return false;
}

export function validatePublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs can be imported.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("[") ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    throw new Error("Private and local network URLs cannot be imported.");
  }

  parsed.hash = "";
  return parsed;
}

// Re-checks the hostname's *resolved* addresses, not just its literal text, so a
// public-looking domain that resolves to a private/link-local IP (DNS rebinding)
// is still rejected. Call this immediately before every fetch, including redirect hops.
export async function validateResolvedPublicHost(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    throw new Error("Private and local network URLs cannot be imported.");
  }

  const results = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA"),
  ]);
  const addresses = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  if (addresses.length === 0) {
    throw new Error("Could not resolve host.");
  }
  if (addresses.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))) {
    throw new Error("Private and local network URLs cannot be imported.");
  }
}
