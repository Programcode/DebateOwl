# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DebateLab is an AI-powered debate preparation suite. It uses **Supabase Edge Functions** as the backend for all AI calls (keys are never exposed to the browser). Authentication is via Supabase Auth with Google OAuth.

**Live URL:** https://debate.pi-stack.org

## Common Commands

```bash
# Development
npm install              # Install dependencies
npm run dev             # Start dev server on port 8080
npm run build           # Production build to dist/

# Quality
npm run lint            # Run ESLint
npm test                # Run tests with Vitest

# Docker
docker build -t debate-trainer .
docker run -d -p 3001:80 --name debate-app debate-trainer
```

## Architecture

### Backend: Supabase Edge Functions

All AI calls go through `supabase/functions/ai/index.ts`:
- JWT authentication required
- API keys stored as Supabase secrets
- Input sanitization for prompt injection
- Deep research with Jina AI (multi-search, URL verification)

### Frontend: React + Zustand

**Session Store** (`src/lib/stores/session-store.ts`):
- Active results for each feature
- History arrays (savedCases, savedAttacks, etc.)
- Source Library for knowledge base grounding

**Settings Store** (`src/lib/stores/settings-store.ts`):
- Per-feature AI provider configuration
- Theme, language, admin mode

### State Persistence
- All data stored in browser localStorage via Zustand persist
- Auth state in Supabase session

## Feature Organization

Five main features under `src/components/features/`:
- **generate/**: Case generation
- **attack/**: Critical analysis  
- **brainstorm/**: Idea generation
- **factoids/**: Evidence research with web search
- **ask/**: Coach chat

Each follows: `FeatureForm.tsx` → `FeatureResults.tsx` pattern.

## Security

| Layer | Implementation |
|-------|----------------|
| API Keys | Supabase Edge Function secrets |
| Auth | Supabase Auth + JWT |
| Input Validation | Prompt injection sanitization |
| Nginx | CSP headers, block sensitive files |

## Critical Files

- **Edge Function**: `supabase/functions/ai/index.ts` - All AI logic
- **Supabase Client**: `src/lib/supabase/client.ts`
- **State**: `src/lib/stores/session-store.ts`, `settings-store.ts`
- **Schemas**: `src/lib/ai/schemas/` - Zod validation
- **Deployment**: `Dockerfile`, `nginx.conf`

## Deployment

Docker two-stage build:
1. Node builder: `npm ci → npm run build`
2. nginx runtime: serves static files

Production uses Watchtower for auto-updates from Docker Hub.

## Admin Mode

Code `debate2026` in Settings unlocks:
- Global custom system prompt
- Database reset
