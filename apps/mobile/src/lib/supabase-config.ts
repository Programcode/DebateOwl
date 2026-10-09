// The one copy of the project URLs and anon keys is the web app's projects.ts.
// It is side-effect free and imports nothing, so Metro can bundle it as is.
import { SUPABASE_PROJECTS } from '../../../../src/lib/supabase/projects';

export type MobileSupabaseEnv = 'staging' | 'production';

/**
 * The app talks to staging unless a build sets EXPO_PUBLIC_SUPABASE_ENV=production.
 * Production is never a fallback, so a misconfigured build cannot reach it.
 */
export function resolveSupabaseEnv(value: string | undefined): MobileSupabaseEnv {
  const env = value?.trim();
  if (!env || env === 'staging') return 'staging';
  if (env === 'production') return 'production';
  throw new Error(`Unknown EXPO_PUBLIC_SUPABASE_ENV: ${env}`);
}

export const supabaseEnv = resolveSupabaseEnv(process.env.EXPO_PUBLIC_SUPABASE_ENV);
export const supabaseProject = SUPABASE_PROJECTS[supabaseEnv];

/** supabase-js's default key for this project, named so the app can read a session it kept offline. */
export const sessionStorageKey = `sb-${new URL(supabaseProject.url).hostname.split('.')[0]}-auth-token`;
