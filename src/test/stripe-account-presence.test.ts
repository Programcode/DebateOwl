import { describe, expect, it } from "vitest";
import { accountPresence } from "../../supabase/functions/stripe-webhook/account-presence";

describe("checkout after account deletion", () => {
  it("keeps a checkout whose account is still there", () => {
    expect(accountPresence({ user: { id: "user-1" } })).toBe("present");
  });

  it("treats a deleted account as missing so billing can be canceled", () => {
    expect(accountPresence({ user: null, errorStatus: 404, errorMessage: "User not found" })).toBe("missing");
    expect(accountPresence({ user: null, errorMessage: "User not found" })).toBe("missing");
  });

  it("retries when the account lookup itself failed", () => {
    expect(accountPresence({ user: null, errorStatus: 500, errorMessage: "timeout" })).toBe("unknown");
    expect(accountPresence({ user: null })).toBe("unknown");
  });
});
