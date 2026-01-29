# Supabase Backend (Production-Ready Wiring)

This backend is fully wired to the app (auth + data + AI proxy). No placeholders.

## Project
- URL: https://uziwdtkzofptihahfooo.supabase.co
- Publishable key: sb_publishable_FCOjs726U466nD8jmv-HZw_DUYqSz-6

## What this provides
- Auth via Google OAuth (required to use the app)
- Postgres storage for cases, chats, sources, settings
- Edge Function AI proxy (no API keys in browser)

## Setup (Supabase dashboard)

1) Run the migration SQL
- Open SQL editor
- Paste `supabase/migrations/20260129_init.sql`

2) Create Edge Function `ai`
- In Supabase Dashboard, create a function named `ai`
- Paste `supabase/functions/ai/index.ts`
- Add secrets:
  - OPENAI_API_KEY
  - ANTHROPIC_API_KEY (optional)
  - GOOGLE_API_KEY (optional)
  - JINA_API_KEY (optional)
  - AI_DEFAULT_PROVIDER (optional, default: openai)
  - AI_DEFAULT_MODEL (optional, default: gpt-4o-mini)

3) Enable Google OAuth
- Auth -> Providers -> Google
- Set redirect URL to: https://uziwdtkzofptihahfooo.supabase.co/auth/v1/callback
- Add `http://localhost:8080` as a redirect URL for local dev

## Local dev
- Start app with `npm run dev`
- Sign in with Google
- All saved data syncs to Supabase
