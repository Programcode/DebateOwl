/** Runtime environment resolver for Supabase. */

import { STAGING_PREVIEW_PROXY_PATH, SUPABASE_PROJECTS } from "./projects";

export type SupabaseEnv = "local" | "production" | "staging";

type EnvironmentInput = {
  VITE_LOCAL_PREVIEW?: string;
  VITE_LOCAL_SUPABASE_ANON_KEY?: string;
  VITE_LOCAL_SUPABASE_URL?: string;
  VITE_STAGING_PREVIEW?: string;
  VITE_SUPABASE_ENV?: string;
};

type StorageReader = { getItem(key: string): string | null };
/** `pinned` means the environment was fixed at build time and the toggle can't change it. */
type SupabaseConfig = { anonKey: string; env: SupabaseEnv; pinned?: true; url: string };

export const ENV_STORAGE_KEY = "debate-supabase-env";

const ENVS = SUPABASE_PROJECTS;

export function resolveSupabaseConfig(
  environment: EnvironmentInput,
  storage: StorageReader,
  currentOrigin?: string,
): SupabaseConfig {
  const localPreview = environment.VITE_LOCAL_PREVIEW === "true";
  const stagingPreview = environment.VITE_STAGING_PREVIEW === "true";
  if (localPreview && stagingPreview) {
    throw new Error("Local preview and staging preview cannot both be enabled");
  }

  if (localPreview) {
    const url = environment.VITE_LOCAL_SUPABASE_URL?.trim();
    const anonKey = environment.VITE_LOCAL_SUPABASE_ANON_KEY?.trim();
    if (!url || !anonKey) throw new Error("Local preview configuration is incomplete");

    const parsedUrl = new URL(url);
    if (Object.values(ENVS).some((remote) => remote.url === parsedUrl.origin)) {
      throw new Error("Local preview cannot use a remote Supabase project");
    }
    return { anonKey, env: "local", url: parsedUrl.href.replace(/\/$/, "") };
  }

  // Tailnet previews: always staging, reached through the dev server's proxy on
  // this origin. Never production, whatever the toggle says.
  if (stagingPreview) {
    if (!currentOrigin) throw new Error("Staging preview needs the page origin");
    return {
      anonKey: ENVS.staging.anonKey,
      env: "staging",
      pinned: true,
      url: `${new URL(currentOrigin).origin}${STAGING_PREVIEW_PROXY_PATH}`,
    };
  }

  // Hosted builds can pin one project; the staging Vercel project sets
  // VITE_SUPABASE_ENV=staging so each PR gets a staging preview.
  const pinned = environment.VITE_SUPABASE_ENV?.trim();
  if (pinned) {
    if (pinned !== "production" && pinned !== "staging") {
      throw new Error(`Unknown VITE_SUPABASE_ENV: ${pinned}`);
    }
    return { ...ENVS[pinned], env: pinned, pinned: true };
  }

  return storage.getItem(ENV_STORAGE_KEY) === "staging"
    ? { ...ENVS.staging, env: "staging" }
    : { ...ENVS.production, env: "production" };
}

const storageReader: StorageReader = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
};
const active = resolveSupabaseConfig(
  import.meta.env,
  storageReader,
  typeof window === "undefined" ? undefined : window.location.origin,
);

export function getActiveEnv(): SupabaseEnv {
  return active.env;
}

/** True when the build fixed the environment (local or staging preview). */
export function isEnvPinned(): boolean {
  return active.env === "local" || active.pinned === true;
}

export function setActiveEnv(env: Exclude<SupabaseEnv, "local">): void {
  if (isEnvPinned()) return;
  if (env === "production") localStorage.removeItem(ENV_STORAGE_KEY);
  else localStorage.setItem(ENV_STORAGE_KEY, env);
}

export const SUPABASE_URL = active.url;
export const SUPABASE_ANON_KEY = active.anonKey;
