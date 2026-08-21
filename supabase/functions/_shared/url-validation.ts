// SSRF-safe URL validation for outbound fetches to AI/search-supplied URLs
// (citation verification, content fetching). Rejects loopback, link-local,
// RFC1918, and IPv4-mapped-IPv6 private targets by literal hostname.

export function isPrivateIpv4(hostname: string) {
  // Canonicalize numeric/octal/hex/short IPv4 forms (e.g. "127.1", "0x7f000001",
  // "2130706433") to dotted-decimal via the same WHATWG host parser `new URL()`
  // uses, so an obfuscated loopback/private address can't slip past the range
  // checks below just because it wasn't written as four decimal octets.
  let canonical = hostname;
  try {
    canonical = new URL(`http://${hostname}`).hostname;
  } catch {
    // Not parseable as a host on its own; fall through and let the range
    // checks below reject it via the length/range guard.
  }
  const parts = canonical.split(".").map((part) => Number(part));
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
  const h = hostname.toLowerCase().replace(/%.*$/, "");
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1" || h === "0:0:0:0:0:0:0:0") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  const v4MappedMatch = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch && isPrivateIpv4(v4MappedMatch[1])) return true;
  return false;
}

export function validatePublicHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs can be fetched.");
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
    throw new Error("Private and local network URLs cannot be fetched.");
  }

  parsed.hash = "";
  return parsed;
}
