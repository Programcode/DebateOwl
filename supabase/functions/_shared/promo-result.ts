// Codes for redeem-promo's answers. redeem_promo_code_atomic answers in English
// (only too_many_attempts has a code), so redeem-promo and the browser both name
// its message by code, and the browser shows its own translation. The browser
// also reads the message, for a redeem-promo deployed before these codes.

export const PROMO_RESULT_CODES = [
  "promo_applied",
  "promo_discount_noted",
  "promo_invalid",
  "promo_already_redeemed",
  "promo_too_many_attempts",
  "promo_unsupported",
  "promo_missing",
  "promo_failed",
] as const;

export type PromoResultCode = typeof PROMO_RESULT_CODES[number];

/** The English messages the database function and redeem-promo answer with. */
export const PROMO_RESULT_MESSAGES: Record<PromoResultCode, string> = {
  promo_applied: "Promo code applied!",
  promo_discount_noted: "Discount code noted! Apply it at checkout for a discount.",
  promo_invalid: "Invalid or expired promo code",
  promo_already_redeemed: "You've already redeemed this code",
  promo_too_many_attempts: "Too many promo code attempts. Try again in 15 minutes.",
  promo_unsupported: "Unsupported promo code type",
  promo_missing: "Please enter a promo code",
  promo_failed: "Unable to redeem promo code. Please try again.",
};

const isPromoResultCode = (value: unknown): value is PromoResultCode =>
  typeof value === "string" && (PROMO_RESULT_CODES as readonly string[]).includes(value);

/** The code for a redemption answer: its own code when it has one, else the code its message stands for. */
export function promoResultCode(result: { code?: unknown; message?: unknown } | null | undefined): PromoResultCode | undefined {
  if (!result) return undefined;
  if (result.code === "too_many_attempts") return "promo_too_many_attempts";
  if (isPromoResultCode(result.code)) return result.code;
  const message = typeof result.message === "string" ? result.message.trim() : "";
  return PROMO_RESULT_CODES.find((code) => PROMO_RESULT_MESSAGES[code] === message);
}
