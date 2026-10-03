// Shared CORS policy for every browser-called Edge Function.
//
// This used to be copy-pasted into each function and had drifted: some lists
// omitted the Playwright port (18080), and demo-code-login omitted the
// Capacitor WebView origin entirely.

export const PUBLIC_WEB_APP_ORIGIN = "https://debate.pi-stack.org";

/** Browser origins allowed to call the functions. Index 0 is the fallback. */
export const ALLOWED_ORIGINS = [
  PUBLIC_WEB_APP_ORIGIN,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:18080",
  "http://127.0.0.1:18080",
  "http://127.0.0.1:18081", // Local full-stack browser gate
  "http://localhost:5173",
  "http://127.0.0.1:54321", // Local Supabase
  "capacitor://localhost", // iOS Capacitor WebView
] as const;

/**
 * Vercel preview and staging hosts for the two DebateLab projects. Preview
 * hosts end in this team's scope slug. Tokens live in the real origin's
 * storage, so a lookalike host gains nothing from being allowed here.
 */
const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/(?:debate-navigator|debatelab-staging)-[a-z0-9-]+-adam-gaborjanis-projects\.vercel\.app$/;
const STAGING_WEB_APP_ORIGIN = "https://debatelab-staging.vercel.app";

export function isAllowedOrigin(origin: string): boolean {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin) ||
    origin === STAGING_WEB_APP_ORIGIN ||
    VERCEL_PREVIEW_ORIGIN.test(origin);
}

export type CorsMethods = "POST, OPTIONS" | "GET, POST, OPTIONS" | "POST, GET, OPTIONS";

/**
 * Matches the exact hostname and requires http:, rather than a string prefix.
 * `startsWith("http://localhost")` also matches an attacker-controlled origin
 * like "http://localhost.evil.com".
 */
export function isDevOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname)
  );
}

export interface CorsOptions {
  /** Allow any localhost/127.0.0.1/192.168.x.x origin, for on-device testing. */
  allowDevOrigins?: boolean;
  methods?: CorsMethods;
}

export function getCorsHeaders(
  origin: string | null,
  { allowDevOrigins = false, methods = "POST, OPTIONS" }: CorsOptions = {},
): Record<string, string> {
  const permitted = Boolean(origin) && (
    isAllowedOrigin(origin as string) ||
    (allowDevOrigins && isDevOrigin(origin as string))
  );
  return {
    "Access-Control-Allow-Origin": permitted ? origin as string : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
  };
}
