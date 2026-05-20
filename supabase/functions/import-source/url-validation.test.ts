import { isPrivateIpv4, isPrivateIpv6, validatePublicHttpUrl } from "./url-validation.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, expectedMessageFragment: string) {
  try {
    fn();
    throw new Error(`Expected throw containing "${expectedMessageFragment}"`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes(expectedMessageFragment)) {
      throw new Error(`Expected error containing "${expectedMessageFragment}", got "${message}"`);
    }
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
