// SSRF-safe URL validation helpers for the import-source edge function.
// Exported separately from index.ts so they can be unit-tested without
// invoking Deno.serve at module load.
//
// isPrivateIpv4/isPrivateIpv6 live in ../_shared/url-validation.ts and are
// re-exported here so this file and the shared copy can't drift apart.

import { isPrivateIpv4, isPrivateIpv6 } from "../_shared/url-validation.ts";
import { untilAborted } from "../_shared/bounded-body.ts";

export { isPrivateIpv4, isPrivateIpv6 };

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
// public-looking domain that resolves to a private, reserved or link-local IP is
// still rejected. Returns the checked addresses: connect only to one of those
// (pinned-fetch.ts), never to the hostname, or a resolver that answers
// differently a moment later reaches whatever it names (DNS rebinding).
export async function validateResolvedPublicHost(url: URL, signal?: AbortSignal): Promise<string[]> {
  const hostname = url.hostname.toLowerCase();
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    throw new Error("Private and local network URLs cannot be imported.");
  }

  const results = await untilAborted(Promise.allSettled([
    Deno.resolveDns(hostname, "A", { signal }),
    Deno.resolveDns(hostname, "AAAA", { signal }),
  ]), signal);
  const addresses = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  if (addresses.length === 0) {
    throw new Error("Could not resolve host.");
  }
  if (addresses.some((address) => isPrivateIpv4(address) || isPrivateIpv6(address))) {
    throw new Error("Private and local network URLs cannot be imported.");
  }
  return addresses;
}
