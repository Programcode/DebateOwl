// SSRF-safe URL validation for outbound fetches to user- or AI-supplied URLs.
// Rejects every IPv4 and IPv6 range in the IANA special-purpose registries that
// is not globally reachable, plus multicast, reserved and NAT64 space.

type Cidr = readonly [bytes: readonly number[], prefixLength: number];

// https://www.iana.org/assignments/iana-ipv4-special-registry
const BLOCKED_IPV4: readonly Cidr[] = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // private-use
  [[100, 64, 0, 0], 10], // shared address space (CGNAT)
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, including cloud metadata
  [[172, 16, 0, 0], 12], // private-use
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // documentation (TEST-NET-1)
  [[192, 88, 99, 0], 24], // deprecated 6to4 relay anycast
  [[192, 168, 0, 0], 16], // private-use
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // documentation (TEST-NET-2)
  [[203, 0, 113, 0], 24], // documentation (TEST-NET-3)
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved, including limited broadcast
];

// ::ffff:0:0/96 carries an IPv4 address, which is checked against the IPv4 list.
const IPV4_MAPPED: Cidr = [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96];

// https://www.iana.org/assignments/iana-ipv6-special-registry
const BLOCKED_IPV6: readonly Cidr[] = [
  [[], 96], // ::/96: unspecified, loopback and deprecated IPv4-compatible
  [[0, 0x64, 0xff, 0x9b], 96], // NAT64 well-known prefix
  [[0, 0x64, 0xff, 0x9b, 0, 1], 48], // local-use NAT64
  [[0x01, 0x00], 64], // discard-only
  [[0x20, 0x01, 0x00, 0x00], 23], // IETF protocol assignments, including Teredo
  [[0x20, 0x01, 0x0d, 0xb8], 32], // documentation
  [[0x20, 0x02], 16], // 6to4
  [[0x3f, 0xff], 20], // documentation
  [[0x5f, 0x00], 16], // segment routing (SRv6) SIDs
  [[0xfc], 7], // unique local
  [[0xfe, 0x80], 10], // link-local
  [[0xfe, 0xc0], 10], // deprecated site-local
  [[0xff], 8], // multicast
];

function inCidr(address: readonly number[], [network, prefixLength]: Cidr): boolean {
  for (let bit = 0; bit < prefixLength; bit += 8) {
    const index = bit / 8;
    const bits = Math.min(8, prefixLength - bit);
    const mask = (0xff << (8 - bits)) & 0xff;
    if (((address[index] ?? 0) & mask) !== ((network[index] ?? 0) & mask)) return false;
  }
  return true;
}

function parseIpv4(hostname: string): number[] | null {
  // Canonicalize numeric/octal/hex/short IPv4 forms (e.g. "127.1", "0x7f000001",
  // "2130706433") to dotted-decimal via the same WHATWG host parser `new URL()`
  // uses, so an obfuscated address can't slip past the range checks.
  let canonical = hostname;
  try {
    canonical = new URL(`http://${hostname}`).hostname;
  } catch {
    // Not parseable as a host on its own; the octet check below rejects it.
  }
  const parts = canonical.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function parseIpv6(hostname: string): number[] | null {
  const literal = hostname.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!literal.includes(":")) return null;
  let canonical: string;
  try {
    // The WHATWG parser validates the literal and rewrites any embedded
    // dotted IPv4 tail as two hex groups.
    canonical = new URL(`http://[${literal}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [head, tail = ""] = canonical.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups = canonical.includes("::")
    ? [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups]
    : headGroups;
  if (groups.length !== 8) return null;
  return groups.flatMap((group) => {
    const value = parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

export function isPrivateIpv4(hostname: string) {
  const address = parseIpv4(hostname);
  return address !== null && BLOCKED_IPV4.some((cidr) => inCidr(address, cidr));
}

export function isPrivateIpv6(hostname: string) {
  const address = parseIpv6(hostname.toLowerCase());
  if (address === null) return false;
  if (inCidr(address, IPV4_MAPPED)) {
    return isPrivateIpv4(address.slice(12).join("."));
  }
  return BLOCKED_IPV6.some((cidr) => inCidr(address, cidr));
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
