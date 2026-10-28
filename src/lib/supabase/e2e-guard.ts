import { SUPABASE_PROJECTS } from "./projects";

/** Where credential-free browser runs send the production fallback. Not a project. */
export const E2E_SUPABASE_URL = "http://e2e.invalid";
export const E2E_SUPABASE_ANON_KEY = "e2e-local-anon";

const PRODUCTION_ORIGIN = new URL(SUPABASE_PROJECTS.production.url).origin;

export function isProductionSupabaseUrl(url: string): boolean {
  try {
    return new URL(url).origin === PRODUCTION_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Credential-free e2e and agent browser runs must not call the production
 * project. Set E2E_ALLOW_PROD=1 (and VITE_E2E_ALLOW_PROD=1 for the client) to
 * force it, for example the production canary, which does not use this server.
 */
export function e2eRefusesProductionRequest(options: {
  allowProduction: boolean;
  e2e: boolean;
  url: string;
}): boolean {
  return options.e2e && !options.allowProduction && isProductionSupabaseUrl(options.url);
}

export function assertE2eSupabaseTarget(env: Record<string, string | undefined> = process.env): void {
  if (env.E2E_ALLOW_PROD === "1") return;
  const pinned = env.VITE_SUPABASE_ENV?.trim();
  const configured = env.VITE_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim() || "";
  if (pinned === "production" || (configured && isProductionSupabaseUrl(configured))) {
    throw new Error(
      "E2E refuses to target the production Supabase project. Set E2E_ALLOW_PROD=1 to force it.",
    );
  }
}
