/**
 * Public connection details for the hosted Supabase projects. Side-effect free
 * so vite.config.ts can import it as well as the app.
 */
export const SUPABASE_PROJECTS = {
  production: {
    url: "https://uziwdtkzofptihahfooo.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6aXdkdGt6b2ZwdGloYWhmb29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MDM0MzAsImV4cCI6MjA4NTI3OTQzMH0.caJvRcwlc5w_xGO_HpYxDobmibLbboa_kB2M1IjO3jw",
  },
  staging: {
    url: "https://brifeyypjauyusmkptkx.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyaWZleXlwamF1eXVzbWtwdGt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTI5NjEsImV4cCI6MjA5NDgyODk2MX0.xKYcvponjw5b_ouPhJDnSBBB1CUSw1Jpz35zGiMmH6A",
  },
} as const;

/**
 * In staging preview mode the app calls Supabase through this path on its own
 * origin, and the dev server proxies it to the staging project. Requests stay
 * same-origin, so Edge Function CORS lists need no preview entries. It must not
 * collide with a repo folder: Vite serves `supabase/functions/_shared` at
 * `/supabase/...` in dev, and the frontend imports from there.
 */
export const STAGING_PREVIEW_PROXY_PATH = "/__staging-supabase";
