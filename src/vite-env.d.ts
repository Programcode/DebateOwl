/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_PREVIEW?: string;
  readonly VITE_LOCAL_SUPABASE_ANON_KEY?: string;
  readonly VITE_LOCAL_SUPABASE_URL?: string;
}
