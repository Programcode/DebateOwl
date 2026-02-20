# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DebateLab is an AI-powered debate preparation suite for competitive debaters. It combines multiple AI providers (OpenAI, Google Gemini, Anthropic) with real-time web research via Exa. Uses **Supabase Edge Functions** as the backend so API keys are never exposed to the browser. Authentication is via Supabase Auth with Google OAuth.

**Live URL:** https://debate.pi-stack.org
**Hosting:** Raspberry Pi + Docker + Cloudflare Tunnel

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5 |
| Styling | TailwindCSS + shadcn/ui (51+ components) |
| State | Zustand with localStorage persistence |
| Forms | React Hook Form + Zod validation |
| Routing | React Router v6 |
| Backend | Supabase Edge Functions (Deno runtime) |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase PostgreSQL (15 tables, RLS enabled) |
| AI Providers | OpenAI, Google Gemini, Anthropic Claude |
| Web Search | Exa (Search + Contents) |
| CI/CD | GitHub Actions + Docker Hub + Watchtower |

## Common Commands

```bash
# Development
npm install              # Install dependencies
npm run dev             # Start dev server on port 8080
npm run build           # Production build to dist/
npm run build:dev       # Dev build with source maps
npm run preview         # Preview production build

# Quality
npm run lint            # Run ESLint
npm test                # Run tests with Vitest (39 tests)
npm run test:watch      # Run tests in watch mode

# Docker
docker build -t debate-trainer .
docker run -d -p 3001:80 --name debate-app debate-trainer

# Supabase
npx supabase functions deploy ai       # Deploy AI function
npx supabase functions deploy admin    # Deploy admin function
npx supabase functions deploy share    # Deploy share function
```

## Architecture

### Backend: 3 Supabase Edge Functions

1. **`supabase/functions/ai/index.ts`** (~888 lines) - Main AI proxy
   - JWT authentication required
   - API keys stored as Supabase secrets (OPENAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, EXA_API_KEY)
   - Input sanitization with prompt injection pattern detection
   - Deep research with Exa (multi-round search, content reading, URL verification)
   - Rate limiting per authenticated user
   - Multi-provider routing (OpenAI, Google, Anthropic)

2. **`supabase/functions/admin/index.ts`** (~329 lines) - Admin API
   - Admin role verification
   - User management, usage stats

3. **`supabase/functions/share/index.ts`** (~131 lines) - Share link creation
   - Unique share code generation with collision detection

### Frontend: React + Zustand

**AI Client** (`src/lib/ai/client.ts`):
- Calls Edge Function via `fetch` with JWT Bearer token
- Custom error hierarchy: `AIError`, `AIAuthError`, `AIRateLimitError`, `AIProviderError`, `AIResponseError`, `TimeoutError`
- Type guards for error handling

**Session Store** (`src/lib/stores/session-store.ts`):
- Active results for each feature (generateResult, attackResult, etc.)
- History arrays (savedCases, savedAttacks, savedBrainstorms, savedFactoids, savedChats)
- Source Library for knowledge base grounding
- Persistence key: `debate-trainer-storage`

**Settings Store** (`src/lib/stores/settings-store.ts`):
- Per-feature AI provider configuration (provider, model, temperature)
- Theme (light/dark/system), language (en/es)
- Admin mode, custom system prompt
- Persistence key: `debate-settings`

### State Persistence
- All data stored in browser localStorage via Zustand persist
- Auth state in Supabase session

## Project Structure

```
src/
├── components/
│   ├── auth/          # Auth-related components
│   ├── features/      # Feature-specific components (9 folders)
│   ├── landing/       # Landing page components (11 files)
│   ├── layout/        # AppLayout, Sidebar, MobileNav
│   └── ui/            # shadcn/ui components (51 files)
├── hooks/             # use-mobile, use-speech-to-text, use-toast
├── lib/
│   ├── ai/
│   │   ├── client.ts  # AI integration (Edge Function calls)
│   │   └── schemas/   # Zod validation (ask, attack, brainstorm, factoids, generate)
│   ├── stores/        # Zustand stores
│   ├── supabase/      # Client + AuthProvider
│   └── validation/    # URL validation
├── pages/             # 14 route pages
└── test/              # Tests (39 passing across 8 files)

supabase/functions/    # Edge Functions (ai, admin, share)
```

## Feature Organization

Main features under `src/components/features/`:
- **generate/**: Case generation (4-6-6-3 tournament format, contentions with CWI structure)
- **attack/**: Critical analysis with fallacy detection and severity ratings
- **brainstorm/**: Multi-mode ideation (mindmap, buckets, top-5)
- **factoids/**: Deep research with multi-round Exa search, URL verification, content reading
- **ask/**: Coach chat with conversation memory, source grounding, voice input

Each follows: `FeatureForm.tsx` -> `FeatureResults.tsx` pattern.

Additional features:
- **Source Library** (`/library`): Persistent knowledge base (URL reading, manual text, response saving)
- **Debate Timer** (`/timer`): Presets for constructive (4m), rebuttal (6m), cross-ex (6m), summary (3m)
- **Word/PDF Export**: Download cases as .docx or formatted PDF
- **Google Docs Export**: Direct export via Google Docs API
- **Argument Flowcharts**: Visual debate flow with React Flow

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | GeneratePage | Case generation |
| `/attack` | AttackPage | Case critique |
| `/brainstorm` | BrainstormPage | Idea generation |
| `/factoids` | FactoidsPage | Research |
| `/ask` | AskPage | Chat coaching |
| `/library` | LibraryPage | Source library |
| `/history` | HistoryPage | Saved items |
| `/timer` | TimerPage | Debate stopwatch |
| `/settings` | SettingsPage | Configuration |
| `/login` | LoginPage | Authentication |

## Database Schema (15 tables)

Tables with RLS enabled: `user_settings`, `cases`, `attacks`, `brainstorms`, `factoids`, `chats`, `messages`, `sources`, `source_files`, `ai_requests`, `api_keys`, `shared_items`, `user_roles`, `rate_limits`, `global_prompts`

All RLS policies use optimized `(SELECT auth.uid())` pattern.

## Security

| Layer | Implementation |
|-------|----------------|
| API Keys | Supabase Edge Function secrets (never in browser) |
| Auth | Supabase Auth + JWT verification |
| Input Validation | Prompt injection regex patterns, MAX_INPUT_LENGTH=50000 |
| CORS | Strict allowlist (debate.pi-stack.org + localhost) |
| Nginx | CSP headers, HSTS, X-Frame-Options, block sensitive files |
| URL Validation | Block javascript:, data:, vbscript:, file: protocols |
| File Validation | 10MB limit, allowed extensions only |
| RLS | All 15 tables protected with row-level security |

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Frontend (.env) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend (.env) | Supabase anonymous key |
| `OPENAI_API_KEY` | Supabase secrets | OpenAI API key |
| `GOOGLE_API_KEY` | Supabase secrets | Google AI API key |
| `ANTHROPIC_API_KEY` | Supabase secrets | Anthropic API key |
| `EXA_API_KEY` | Supabase secrets | Exa API key |
| `AI_DEFAULT_PROVIDER` | Supabase secrets | Default provider (google) |
| `AI_DEFAULT_MODEL` | Supabase secrets | Default model (gemini-2.0-flash) |

## Deployment

Docker two-stage build:
1. Node builder (`node:20-alpine`): `npm ci` -> `npm run build`
2. Nginx runtime (`nginx:alpine`): serves static files from `dist/`

Production: Raspberry Pi + Watchtower for auto-updates from Docker Hub + Cloudflare Tunnel.

CI/CD: GitHub Actions on push to main -> build + push multi-arch Docker image.

## Adding a New Feature

1. Create Zod schema: `src/lib/ai/schemas/newfeature.ts`
2. Update Edge Function: `supabase/functions/ai/index.ts` (add feature case)
3. Create form component: `src/components/features/newfeature/NewFeatureForm.tsx`
4. Create results component: `src/components/features/newfeature/NewFeatureResults.tsx`
5. Create page: `src/pages/NewFeaturePage.tsx`
6. Add route: `src/App.tsx`
7. Update stores: `src/lib/stores/session-store.ts`

## Coding Conventions

- 2-space indentation
- Named exports preferred
- `@/` alias for `src/` imports
- PascalCase.tsx for components, kebab-case.ts for utilities
- Functional components with hooks
- React Hook Form for forms, Zod for runtime validation
- shadcn/ui for UI components, TailwindCSS for styling

## Admin Mode

Code `debate2026` in Settings unlocks:
- Global custom system prompt
- Database reset functionality
- Advanced configuration options

## Known Technical Debt

- TypeScript strict mode disabled in `tsconfig.app.json` (TD-01, high priority)
- Bundle size warnings: GeneratePage (360KB), vendor-charts/Recharts (400KB)
- Test coverage measurement blocked by peer dep conflict (@vitest/coverage-v8)
- Deep research may approach Edge Function timeout limits

## Upcoming Features (Roadmap)

**Next up:**
- Practice Mode / Sparring Partner (AI plays opponent, turn-based with timer)
- Debate Wiki integration (WikiDebate, NDCA caselist)
- Stripe payments (free trial -> $5/mo Pro tier, promo code system)
- Native mobile apps (Capacitor or React Native)
