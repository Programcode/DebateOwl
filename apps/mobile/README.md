# DebateLab mobile

The DebateLab iOS app, built with Expo and Expo Router. It shares `@debatelab/core` and the translation catalogs with the website and talks to the staging Supabase project by default.

Agent and contributor rules are in [AGENTS.md](AGENTS.md). Running it on an iPhone with Expo Go is described in [docs/development.md](../../docs/development.md#mobile-app).

```bash
npm ci                                   # from the repo root; installs every workspace
npm run -w @debatelab/mobile start       # Metro dev server for Expo Go
npm run -w @debatelab/mobile typecheck
npm run -w @debatelab/mobile export:web  # static web preview in apps/mobile/dist
```
