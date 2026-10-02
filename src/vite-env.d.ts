/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_PREVIEW?: string;
  readonly VITE_LOCAL_SUPABASE_ANON_KEY?: string;
  readonly VITE_LOCAL_SUPABASE_URL?: string;
  readonly VITE_STAGING_PREVIEW?: string;
  readonly VITE_COLLABORATION_URL?: string;
  readonly VITE_SUPABASE_ENV?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
}
