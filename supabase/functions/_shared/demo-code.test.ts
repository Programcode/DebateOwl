import { generateDemoCode, getDemoCodeDenialReason } from "./demo-code.ts";

Deno.test("generated demo codes use the login format", () => {
  const code = generateDemoCode();
  if (!/^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    throw new Error(`unexpected demo code format: ${code}`);
  }
});

const validCode = { disabled_at: null, expires_at: null, max_uses: 3, use_count: 0 };

Deno.test("expired demo codes are denied", () => {
  const reason = getDemoCodeDenialReason({ ...validCode, expires_at: "2020-01-01T00:00:00.000Z" });
  if (reason !== "expired") throw new Error(`expected expired, got ${reason}`);
});

Deno.test("disabled demo codes are denied", () => {
  const reason = getDemoCodeDenialReason({ ...validCode, disabled_at: "2026-01-01T00:00:00.000Z" });
  if (reason !== "disabled") throw new Error(`expected disabled, got ${reason}`);
});

Deno.test("demo codes at their max use count are denied", () => {
  const reason = getDemoCodeDenialReason({ ...validCode, use_count: 3 });
  if (reason !== "max_uses") throw new Error(`expected max_uses, got ${reason}`);
});
