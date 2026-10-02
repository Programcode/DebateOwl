/** Runtime environment resolver for Supabase. */

export type SupabaseEnv = "local" | "production" | "staging";

type EnvironmentInput = {
  VITE_LOCAL_PREVIEW?: string;
  VITE_LOCAL_SUPABASE_ANON_KEY?: string;
  VITE_LOCAL_SUPABASE_URL?: string;
  VITE_SUPABASE_ENV?: string;
};

type RemoteEnv = Exclude<SupabaseEnv, "local">;
type StorageReader = { getItem(key: string): string | null };
type SupabaseConfig = { anonKey: string; env: SupabaseEnv; url: string };

export const ENV_STORAGE_KEY = "debate-supabase-env";

const ENVS: Record<RemoteEnv, { anonKey: string; url: string }> = {
  production: {
    url: "https://uziwdtkzofptihahfooo.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6aXdkdGt6b2ZwdGloYWhmb29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDM0MzAsImV4cCI6MjA4NTI3OTQzMH0.caJvRcwlc5w_xGO_HpYxDobmibLbboa_kB2M1IjO3jw",
  },
  staging: {
    url: "https://brifeyypjauyusmkptkx.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyaWZleXlwamF1eXVzbWtwdGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTI5NjEsImV4cCI6MjA5NDgyODk2MX0.xKYcvponjw5b_ouPhJDnSBBB1CUSw1Jpz35zGiMmH6A",
  },
};

/** A build can pin one project, as the staging Vercel project does. */
function pinnedEnv(environment: EnvironmentInput): RemoteEnv | null {
  const value = environment.VITE_SUPABASE_ENV?.trim();
  if (!value) return null;
  if (value === "production" || value === "staging") return value;
  throw new Error(`Unknown VITE_SUPABASE_ENV: ${value}`);
}

export function resolveSupabaseConfig(environment: EnvironmentInput, storage: StorageReader): SupabaseConfig {
  if (environment.VITE_LOCAL_PREVIEW === "true") {
    const url = environment.VITE_LOCAL_SUPABASE_URL?.trim();
    const anonKey = environment.VITE_LOCAL_SUPABASE_ANON_KEY?.trim();
    if (!url || !anonKey) throw new Error("Local preview configuration is incomplete");

    const parsedUrl = new URL(url);
    if (Object.values(ENVS).some((remote) => remote.url === parsedUrl.origin)) {
      throw new Error("Local preview cannot use a remote Supabase project");
    }
    return { anonKey, env: "local", url: parsedUrl.href.replace(/\/$/, "") };
  }

  const env = pinnedEnv(environment) ?? (storage.getItem(ENV_STORAGE_KEY) === "staging" ? "staging" : "production");
  return { ...ENVS[env], env };
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
const active = resolveSupabaseConfig(import.meta.env, storageReader);
const pinned = active.env !== "local" && pinnedEnv(import.meta.env) !== null;

export function getActiveEnv(): SupabaseEnv {
  return active.env;
}

/** True when this build ignores the saved production/staging toggle. */
export function isEnvPinned(): boolean {
  return pinned;
}

export function setActiveEnv(env: RemoteEnv): void {
  if (active.env === "local" || pinned) return;
  if (env === "production") localStorage.removeItem(ENV_STORAGE_KEY);
  else localStorage.setItem(ENV_STORAGE_KEY, env);
}

export const SUPABASE_URL = active.url;
export const SUPABASE_ANON_KEY = active.anonKey;
