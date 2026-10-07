import { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl, validateResolvedPublicHost } from "./url-validation.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, expectedMessageFragment: string) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes(expectedMessageFragment)) {
      throw new Error(`Expected error containing "${expectedMessageFragment}", got "${message}"`);
    }
  }
  if (!threw) {
    throw new Error(`Expected throw containing "${expectedMessageFragment}"`);
  }
}

Deno.test("isPrivateIpv4 catches RFC1918 + loopback + link-local", () => {
  assert(isPrivateIpv4("10.0.0.1"), "10/8 should be private");
  assert(isPrivateIpv4("127.0.0.1"), "loopback should be private");
  assert(isPrivateIpv4("172.16.5.5"), "172.16/12 should be private");
  assert(isPrivateIpv4("172.31.255.255"), "172.31 should be private");
  assert(isPrivateIpv4("192.168.1.1"), "192.168/16 should be private");
  assert(isPrivateIpv4("169.254.169.254"), "link-local (incl AWS metadata) should be private");
  assert(isPrivateIpv4("100.64.0.1"), "CGNAT 100.64/10 should be private");
  assert(isPrivateIpv4("0.0.0.0"), "0.0.0.0 should be private");

  assert(!isPrivateIpv4("8.8.8.8"), "public DNS should NOT be private");
  assert(!isPrivateIpv4("1.1.1.1"), "public DNS should NOT be private");
  assert(!isPrivateIpv4("172.32.0.1"), "172.32 is not in 172.16/12");
  assert(!isPrivateIpv4("not-an-ip"), "non-IPv4 hostname should not match");
});

Deno.test("isPrivateIpv4 normalizes obfuscated numeric/octal/short loopback forms", () => {
  assert(isPrivateIpv4("127.1"), "short-form 127.1 should normalize to 127.0.0.1");
  assert(isPrivateIpv4("2130706433"), "decimal-integer loopback should be private");
  assert(isPrivateIpv4("0x7f000001"), "hex loopback should be private");
  assert(isPrivateIpv4("017700000001"), "octal loopback should be private");
  assert(isPrivateIpv4("0177.0.0.1"), "octal first-octet loopback should be private");
  assert(!isPrivateIpv4("8.8.8.8"), "public DNS should still not be private after normalization");
});

Deno.test("isPrivateIpv6 catches loopback, ULA, link-local, IPv4-mapped private", () => {
  assert(isPrivateIpv6("::1"), "loopback ipv6 should be private");
  assert(isPrivateIpv6("fc00:0:0:0:0:0:0:1"), "ULA fc00::/7 should be private");
  assert(isPrivateIpv6("fd12:3456:789a::1"), "ULA fd00::/8 should be private");
  assert(isPrivateIpv6("fe80::1"), "link-local fe80::/10 should be private");
  assert(isPrivateIpv6("febf::1"), "link-local upper edge should be private");
  assert(isPrivateIpv6("::ffff:10.0.0.1"), "IPv4-mapped private should be private");

  assert(!isPrivateIpv6("2001:4860:4860::8888"), "public ipv6 should NOT be private");
  assert(!isPrivateIpv6("::ffff:8.8.8.8"), "IPv4-mapped public should NOT be private");
  assert(!isPrivateIpv6("not-ipv6"), "non-ipv6 hostname should not match");
});

Deno.test("isPrivateIpv4 rejects every IANA special-purpose range that is not globally reachable", () => {
  for (const address of [
    "192.0.0.1", "192.0.0.255", // IETF protocol assignments 192.0.0.0/24
    "192.0.2.10", "198.51.100.7", "203.0.113.99", // documentation (TEST-NET-1/2/3)
    "192.88.99.1", // deprecated 6to4 relay anycast
    "198.18.0.1", "198.19.255.254", // benchmarking 198.18.0.0/15
    "224.0.0.1", "239.255.255.250", // multicast 224.0.0.0/4
    "240.0.0.1", "255.255.255.255", // reserved 240.0.0.0/4 and limited broadcast
    "0.1.2.3", // "this network" 0.0.0.0/8
  ]) {
    assert(isPrivateIpv4(address), `${address} should be blocked`);
  }
  for (const address of ["192.0.1.1", "198.17.255.255", "198.20.0.1", "223.255.255.255", "93.184.216.34"]) {
    assert(!isPrivateIpv4(address), `${address} is public and should not be blocked`);
  }
});

Deno.test("isPrivateIpv6 rejects every IANA special-purpose range that is not globally reachable", () => {
  for (const address of [
    "::", "::1", "0:0:0:0:0:0:0:1",
    "::a00:1", // IPv4-compatible (deprecated) ::/96
    "::ffff:a00:1", "::ffff:7f00:1", // IPv4-mapped private, in hex form
    "64:ff9b::c000:201", "64:ff9b::808:808", // NAT64 well-known prefix 64:ff9b::/96
    "64:ff9b:1::1", // local-use NAT64 64:ff9b:1::/48
    "100::1", // discard-only 100::/64
    "2001::1", "2001:1ff::1", // IETF protocol assignments 2001::/23 (Teredo included)
    "2001:db8::1", // documentation 2001:db8::/32
    "2002:c0a8:101::1", // 6to4 2002::/16
    "3fff::1", // documentation 3fff::/20
    "5f00::1", // SRv6 SIDs 5f00::/16
    "fec0::1", // deprecated site-local fec0::/10
    "ff02::1", "ff0e::1", // multicast ff00::/8
    "FE80::1%eth0", // zone id and upper case
    "[fe80::1]", // bracketed literal
  ]) {
    assert(isPrivateIpv6(address), `${address} should be blocked`);
  }
  for (const address of ["2606:4700:4700::1111", "2001:200::1", "2a00:1450:4001:80b::200e", "::ffff:5db8:d822"]) {
    assert(!isPrivateIpv6(address), `${address} is public and should not be blocked`);
  }
});

async function withResolvedAddresses(records: Partial<Record<"A" | "AAAA", string[]>>, run: () => Promise<void>) {
  const original = Deno.resolveDns;
  (Deno as unknown as { resolveDns: unknown }).resolveDns = (_host: string, type: "A" | "AAAA") => Promise.resolve(records[type] ?? []);
  try {
    await run();
  } finally {
      (Deno as unknown as { resolveDns: unknown }).resolveDns = original;
  }
}

async function assertRejects(promise: Promise<unknown>, expectedMessageFragment: string) {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes(expectedMessageFragment)) {
      throw new Error(`Expected error containing "${expectedMessageFragment}", got "${message}"`);
    }
    return;
  }
  throw new Error(`Expected rejection containing "${expectedMessageFragment}"`);
}

Deno.test("validateResolvedPublicHost rejects a public name that resolves into a reserved range", async () => {
  const url = new URL("https://reserved.example/");
  for (const records of [
    { A: ["198.18.0.1"] },
    { A: ["93.184.216.34", "224.0.0.251"] },
    { AAAA: ["64:ff9b::a9fe:a9fe"] },
    { AAAA: ["2001:db8::1"] },
  ]) {
    await withResolvedAddresses(records, () => assertRejects(validateResolvedPublicHost(url), "Private and local"));
  }
});

Deno.test("validateResolvedPublicHost accepts a name that resolves only to public addresses", async () => {
  await withResolvedAddresses({ A: ["93.184.216.34"], AAAA: ["2606:2800:21f:cb07:6820:80da:af6b:8b2c"] }, () =>
    validateResolvedPublicHost(new URL("https://example.com/")));
});

Deno.test("validatePublicHttpUrl accepts plain public https URLs", () => {
  const parsed = validatePublicHttpUrl("https://example.com/article#frag");
  assert(parsed.hostname === "example.com", `expected example.com, got ${parsed.hostname}`);
  assert(parsed.hash === "", "hash fragment should be stripped");
});

Deno.test("validatePublicHttpUrl rejects non-http(s) protocols", () => {
  assertThrows(() => validatePublicHttpUrl("file:///etc/passwd"), "http and https");
  assertThrows(() => validatePublicHttpUrl("javascript:alert(1)"), "http and https");
  assertThrows(() => validatePublicHttpUrl("ftp://example.com"), "http and https");
});

Deno.test("validatePublicHttpUrl rejects malformed URLs", () => {
  assertThrows(() => validatePublicHttpUrl("not a url"), "valid URL");
  assertThrows(() => validatePublicHttpUrl(""), "valid URL");
});

Deno.test("validatePublicHttpUrl rejects private IPv4 hostnames", () => {
  assertThrows(() => validatePublicHttpUrl("http://10.0.0.1/admin"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://127.0.0.1:8080"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://192.168.1.1"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://169.254.169.254/latest/meta-data/"), "Private and local");
});

Deno.test("validatePublicHttpUrl rejects private IPv6 hostnames", () => {
  assertThrows(() => validatePublicHttpUrl("http://[::1]/"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://[fc00::1]/"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://[fe80::1]/"), "Private and local");
});

Deno.test("validatePublicHttpUrl rejects localhost variants", () => {
  assertThrows(() => validatePublicHttpUrl("http://localhost/"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://api.localhost/"), "Private and local");
  assertThrows(() => validatePublicHttpUrl("http://0.0.0.0/"), "Private and local");
});
