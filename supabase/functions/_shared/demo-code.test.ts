import {
  generateDemoCode,
  getDemoCodeDenialReason,
  isDemoCodeRateLimited,
  isDemoUserForCode,
  isValidDemoCode,
  normalizeDemoCode,
} from "./demo-code.ts";

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

Deno.test("demo code input is normalized and invalid formats are rejected", () => {
  if (normalizeDemoCode(" demo-ab12-cd34 ") !== "DEMO-AB12-CD34") throw new Error("normalization failed");
  if (!isValidDemoCode("DEMO-AB12-CD34") || isValidDemoCode("DEMO-ADMIN")) {
    throw new Error("format validation failed");
  }
});

Deno.test("ten failed attempts trigger rate limiting", () => {
  if (isDemoCodeRateLimited([9]) || !isDemoCodeRateLimited([2, 10])) {
    throw new Error("rate-limit threshold failed");
  }
});

Deno.test("existing users must belong to the same demo code", () => {
  if (!isDemoUserForCode({ demo_access_code_id: "code-1" }, "code-1")) throw new Error("matching demo user rejected");
  if (isDemoUserForCode({}, "code-1") || isDemoUserForCode({ demo_access_code_id: "code-2" }, "code-1")) {
    throw new Error("unrelated existing user accepted");
  }
});
