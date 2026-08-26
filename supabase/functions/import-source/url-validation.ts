// URL syntax/literal-address validation helpers for import-source.
//
// The importer sends validated URLs as data to a fixed Exa contents endpoint;
// it does not connect directly to the user-controlled hostname. Literal private
// addresses are still rejected here as a product/security policy and to avoid
// asking the extraction provider to process obviously local destinations.
//
// isPrivateIpv4/isPrivateIpv6 live in ../_shared/url-validation.ts and are
// re-exported here so this file and the shared copy can't drift apart.

import { isPrivateIpv4, isPrivateIpv6 } from "../_shared/url-validation.ts";

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
