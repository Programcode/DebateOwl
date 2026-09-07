const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type DemoCodeState = {
  disabled_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
};

export type DemoCodeDenialReason = "disabled" | "expired" | "max_uses" | null;

export function isCreatableDemoRole(role: unknown): role is "user" {
  return role === "user";
}

export function getDemoLoginRole(role: unknown): "user" | "banned" {
  return role === "banned" ? "banned" : "user";
}

export function normalizeDemoCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidDemoCode(code: string) {
  return /^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

export function isDemoCodeRateLimited(failedAttemptCounts: number[]) {
  return failedAttemptCounts.some((count) => count >= 10);
}

export function isDemoUserForCode(metadata: unknown, codeId: string) {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) &&
    "demo_access_code_id" in metadata && metadata.demo_access_code_id === codeId;
}

export function generateDemoCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const value = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `DEMO-${value.slice(0, 4)}-${value.slice(4)}`;
}

export function getDemoCodeDenialReason(code: DemoCodeState, now = Date.now()): DemoCodeDenialReason {
  if (code.disabled_at) return "disabled";
  if (code.expires_at && new Date(code.expires_at).getTime() <= now) return "expired";
  if (code.max_uses !== null && code.use_count >= code.max_uses) return "max_uses";
  return null;
}

export async function hashDemoCode(code: string) {
  const pepper = Deno.env.get("DEMO_CODE_PEPPER") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!pepper) throw new Error("Missing demo code pepper");

  const bytes = new TextEncoder().encode(`${pepper}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
