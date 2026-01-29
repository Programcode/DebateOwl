# Backend Implementation Plan (DebateLab)

Date: 2026-01-29
Repo: /Users/adam/Code/innovation_fair_2026/lovable-prototype
Input sources: REVIEW_AND_ROADMAP.md + current codebase scan
Target length: ~500 lines

---

## 1) Context and intent
- The app is currently frontend-only with localStorage persistence and direct AI provider calls.
- API keys and admin access are exposed to the browser, which is unsafe for production.
- This plan describes a backend that secures keys, adds auth/accounts, and moves storage off-device.
- The plan is comprehensive and includes options, architecture, data model, and a phased rollout.

---

## 2) Current state highlights (from codebase)
- Direct provider fetches in `src/lib/ai/client.ts` (OpenAI/Anthropic/Google/Jina).
- API keys stored in browser (`src/lib/stores/settings-store.ts`) and `public/config.js`.
- Admin access is a hardcoded code in `src/pages/SettingsPage.tsx`.
- State is in Zustand and persisted to localStorage (`src/lib/stores/session-store.ts`).
- Saved items are client-only: cases, attacks, brainstorms, factoids, chats, sources.
- No backend services exist today; deployment is static + nginx.

---

## 3) What a backend makes easier (value list)
- Secure storage of system API keys and removal from client.
- User authentication, accounts, and profile management.
- Durable storage beyond localStorage limits and browser device lock-in.
- Multi-device sync for cases, chats, and sources.
- Centralized rate limiting and abuse protection.
- Usage analytics and cost tracking per user.
- Admin controls and audit logs.
- Background jobs (URL ingestion, file parsing, embeddings).
- Team collaboration and sharing (future).

---

## 4) Requirements (must-have vs nice-to-have)

Must-have v1:
- Auth + session management.
- AI proxy endpoints for 5 features.
- Secure server-side keys and optional BYOK.
- Cloud storage for saved data and sources.
- Migration path from localStorage.
- Basic rate limiting and logging.

Nice-to-have v1.5:
- OAuth providers (Google/GitHub).
- Team workspaces.
- Usage dashboard + quotas.
- File uploads and parsing.
- Search cache and citations improvements.

---

## 5) Backend options (choose one now)

Option A: Supabase (Postgres + Auth + Storage + Edge Functions)
- Pros: fastest time to MVP, built-in auth/storage, RLS, pgvector.
- Cons: function limits, vendor constraints, less control for AI proxy flows.
- Good for: fastest launch with minimal ops.

Option B: Custom Node backend (Fastify/Express) + Postgres + Redis + S3
- Pros: full control, flexible security model, strong AI proxy and caching.
- Cons: more infra and ops, more code to maintain.
- Good for: product that will grow in features and traffic.

Option C: Serverless edge (Cloudflare Workers + D1 + R2)
- Pros: low ops, global latency, built-in storage.
- Cons: runtime limits, library constraints, DB limitations.
- Good for: moderate workloads, global reach, low ops budget.

Option D: Firebase (Auth + Firestore + Functions)
- Pros: easy auth, realtime, mobile-friendly.
- Cons: Firestore modeling complexity for relational data, cost surprises.
- Good for: mobile-first and realtime-centric product.

Option E: All-in-one OSS (PocketBase, Appwrite)
- Pros: quick and cheap, easy to self-host.
- Cons: limited flexibility for AI proxying and future scaling.
- Good for: internal tools or small demos.

---

## 6) Recommendation
- Recommend Option B for production-grade control and future features.
- If time-to-market is the top priority, Option A is acceptable short-term.
- Avoid leaving AI keys in the browser under any option.

---

## 7) Suggested stack (Option B)
- Node.js 20+.
- Fastify (or Express if team preference).
- PostgreSQL 16.
- Redis for caching and rate limits.
- S3-compatible object storage.
- Prisma or Drizzle ORM.
- OpenTelemetry + Sentry for observability.

---

## 8) High-level architecture
- Client -> Backend API (single origin or proxied).
- Backend API -> Auth module.
- Backend API -> AI proxy module.
- Backend API -> Data module (cases, chats, sources, settings).
- Backend API -> File module (uploads + parsing).
- Data module -> Postgres.
- File module -> S3.
- Rate limit + cache -> Redis.

---

## 9) Core data to move off browser
- Saved cases, attacks, brainstorms, factoids.
- Chat sessions and messages.
- Source library and ingested URLs.
- User settings (theme, language, feature configs).
- System prompt overrides (admin only).

---

## 10) Data model (draft)

Users:
- users: id, email, password_hash, name, avatar_url, created_at, updated_at.
- sessions: id, user_id, refresh_token_hash, ip, user_agent, expires_at.
- oauth_accounts: provider, provider_account_id, tokens (encrypted).

Settings:
- user_settings: user_id, language, theme, feature_configs (jsonb), custom_system_prompt.

Content:
- cases: id, user_id, title, input (jsonb), output (jsonb), created_at.
- attacks: id, user_id, title, input (jsonb), output (jsonb), created_at.
- brainstorms: id, user_id, title, input (jsonb), output (jsonb), created_at.
- factoids: id, user_id, title, input (jsonb), output (jsonb), created_at.
- chats: id, user_id, title, created_at.
- messages: id, chat_id, role, content, created_at.

Sources:
- sources: id, user_id, title, content, type, origin, is_active, created_at.
- source_files: id, user_id, source_id, filename, mime_type, storage_key, size_bytes.

Usage:
- ai_requests: id, user_id, feature, provider, model, tokens_in, tokens_out, latency_ms, status, cost_usd.
- quotas: id, user_id, monthly_token_limit, monthly_request_limit, reset_at.

Keys:
- api_keys: id, user_id, provider, key_ciphertext, key_last4, is_active, created_at.

Admin + audit:
- audit_logs: id, user_id, action, metadata (jsonb), created_at.

---

## 11) Data model notes
- Use jsonb for AI inputs/outputs to reduce schema churn.
- Add indexes on user_id + created_at for all content tables.
- Keep source content bounded; store large text in S3 if needed.
- If teams are added, add org_id to content tables or a join table.

---

## 12) API surface (v1)

Auth:
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- POST /api/v1/auth/refresh
- GET /api/v1/auth/me
- POST /api/v1/auth/password/forgot
- POST /api/v1/auth/password/reset
- POST /api/v1/auth/oauth/:provider

AI proxy:
- POST /api/v1/ai/generate
- POST /api/v1/ai/attack
- POST /api/v1/ai/brainstorm
- POST /api/v1/ai/factoids
- POST /api/v1/ai/ask

Content:
- GET /api/v1/cases, POST /api/v1/cases, GET /api/v1/cases/:id, DELETE /api/v1/cases/:id
- GET /api/v1/attacks, POST /api/v1/attacks, GET /api/v1/attacks/:id, DELETE /api/v1/attacks/:id
- GET /api/v1/brainstorms, POST /api/v1/brainstorms, GET /api/v1/brainstorms/:id, DELETE /api/v1/brainstorms/:id
- GET /api/v1/factoids, POST /api/v1/factoids, GET /api/v1/factoids/:id, DELETE /api/v1/factoids/:id
- GET /api/v1/chats, POST /api/v1/chats, GET /api/v1/chats/:id, POST /api/v1/chats/:id/messages, DELETE /api/v1/chats/:id

Sources:
- GET /api/v1/sources
- POST /api/v1/sources
- PATCH /api/v1/sources/:id
- DELETE /api/v1/sources/:id
- POST /api/v1/sources/upload
- POST /api/v1/sources/parse-url

Settings and keys:
- GET /api/v1/settings
- PUT /api/v1/settings
- PUT /api/v1/settings/feature-configs
- PUT /api/v1/settings/system-prompt
- GET /api/v1/keys
- POST /api/v1/keys
- DELETE /api/v1/keys/:id

Usage:
- GET /api/v1/usage
- GET /api/v1/quotas

Admin:
- GET /api/v1/admin/users
- GET /api/v1/admin/usage
- POST /api/v1/admin/keys/rotate

---

## 13) Example API contract (short)
- All inputs should match existing Zod schemas in `src/lib/ai/schemas/*`.
- Responses include `output` + `usage` + `request_id` where applicable.
- Error shape: `{ error: { code, message, request_id } }`.

---

## 14) Authentication plan
- Use httpOnly cookies with refresh tokens or short-lived JWTs.
- Access token 15m; refresh token 7-30d.
- Store refresh token hash in DB.
- Support password reset with one-time token.
- Optional OAuth providers in phase 2.

---

## 15) Authorization and roles
- Roles: user, admin (and org roles later).
- Admin controls system prompt and key rotation.
- All data endpoints check ownership.

---

## 16) API key management (system + BYOK)
- System keys stored in server secrets only.
- User keys stored encrypted in DB, never sent back to client.
- Show only last4 in UI.
- Optional BYOK mode: user submits once, backend encrypts and stores.
- Rotation: support admin-driven rotation and revoke.

---

## 17) AI proxy flow
- Server builds system prompts and inserts local knowledge from sources.
- Validate inputs with Zod.
- Call provider with server-side keys.
- Parse and validate JSON response with output schemas.
- Store ai_requests metrics for cost tracking.

---

## 18) Prompt safety and sanitization
- Strip control characters and dangerous tokens.
- Enforce maximum input lengths.
- Keep prompt templates server-side to avoid tampering.
- Log suspicious prompt patterns (without storing raw content if possible).

---

## 19) Source ingestion and storage
- URL ingestion via server to prevent CORS issues.
- SSRF protection: allowlist protocols, block internal IP ranges.
- Store extracted text in `sources.content` or S3.
- Support file uploads via signed URLs.
- Optional PDF/Docx parsing in a background job.

---

## 20) Search + citations
- Use Jina search and reader on server.
- Cache results in Redis with TTL.
- Store citation metadata in AI output for traceability.

---

## 21) Storage outside browser
- All saved data in Postgres.
- Keep local UI state only (loading, temporary selections).
- Maintain a small local cache for offline viewing if desired.

---

## 22) Migration plan (localStorage -> backend)

Phase 0: Preparation
- Add backend and auth.
- Add client API wrapper.

Phase 1: Dual write
- Save to backend and localStorage in parallel.
- Show a warning if backend save fails.

Phase 2: Read from backend
- Load server data on app boot.
- If empty, offer to import localStorage.

Phase 3: One-time import
- Import localStorage data with dedupe logic.
- Mark imported entries to avoid duplicates.

Phase 4: Deprecate localStorage
- Keep localStorage for minimal offline cache only.

---

## 23) Frontend changes (high level)
- Add auth screens and session handling.
- Replace provider selection and key input with server-backed settings.
- Add data fetching for history, library, and chats.
- Replace direct fetch calls with API client.
- Add migration UI for localStorage import.

---

## 24) Backend module layout (suggested)
- `server/src/index.ts` bootstrap.
- `server/src/routes/*` for API routes.
- `server/src/services/ai/*` provider adapters.
- `server/src/services/auth/*`.
- `server/src/services/storage/*`.
- `server/src/db/*` schema and migrations.

---

## 25) Rate limiting and quotas
- Per-IP limits for unauthenticated endpoints.
- Per-user limits on AI endpoints.
- Per-feature limits (factoids more expensive).
- Quotas enforced by plan or account status.

---

## 26) Observability
- Structured logs with request_id.
- Metrics: latency, error rate, cost per user.
- Traces for provider calls.
- Alerts for provider failures and cost spikes.

---

## 27) Security checklist
- Remove `public/config.js` from source control.
- Move all keys server-side.
- Strict CORS and CSP.
- Validate all inputs with Zod.
- Limit request sizes and timeouts.
- Enable HTTPS and secure cookies.
- Audit admin actions.

---

## 28) Deployment options
- Single container: backend serves static app + API.
- Split: nginx for static app, backend on separate port.
- Serverless: deploy API to functions with external DB.

---

## 29) CI/CD
- Lint + test on PR.
- Build Docker image for backend.
- Run DB migrations on deploy.
- Separate staging and production.

---

## 30) Testing plan
- Unit tests for provider adapters.
- Integration tests for API routes.
- Schema validation tests.
- Load tests for AI endpoints.
- Security tests (SSRF, auth bypass, rate limiting).

---

## 31) Roadmap (phases)

Phase 1 (Weeks 1-2): Foundation
- Backend skeleton + auth.
- AI proxy endpoints.
- Basic storage for cases/chats/sources.

Phase 2 (Weeks 3-4): Migration
- Dual write and import.
- Replace localStorage for core data.
- File uploads and URL ingestion.

Phase 3 (Weeks 5-6): Hardening
- Rate limits, logging, cost tracking.
- Admin controls and audit logs.

Phase 4 (Weeks 7+): Growth
- OAuth, teams, billing.
- Embeddings and semantic search.

---

## 32) Risks and mitigations
- Risk: SSRF in URL ingestion -> Mitigation: strict URL validation + IP blocklist.
- Risk: Cost spikes -> Mitigation: quotas, caching, alerts.
- Risk: Prompt injection -> Mitigation: server-side templates, sanitization.
- Risk: Migration data loss -> Mitigation: dual write + import preview.

---

## 33) Open questions (answer to finalize plan)
- Do you want BYOK for all users or system-only keys?
- Do you need team accounts in v1?
- Which providers are required on day 1?
- Target monthly cost per user?

---

## 34) Concrete next actions (if approved)
- Decide backend option (A/B/C).
- Set up server scaffold and database schema.
- Move AI calls to backend and update frontend.
- Add auth UI and migration flow.

---

## 35) Appendix: Example request flows

Generate flow:
- Client sends `GenerateInput` to `/api/v1/ai/generate`.
- Server validates input and builds system prompt.
- Server calls provider with server key.
- Server validates output and stores case.
- Client receives output + usage metrics.

Ask flow:
- Client sends message + history.
- Server summarizes if needed.
- Server calls provider and stores messages.
- Client renders response.

---

## 36) Appendix: Example environment variables
- DATABASE_URL
- REDIS_URL
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GOOGLE_API_KEY
- JINA_API_KEY
- JWT_SECRET
- ENCRYPTION_KEY

---

## 37) Appendix: Supabase variant notes
- Use Supabase Auth for sessions.
- Use Edge Functions to proxy AI.
- Store outputs in Postgres.
- Use Storage for files.

---

## 38) Appendix: Cloudflare variant notes
- Use Workers + Queues.
- Store data in D1.
- Store files in R2.
- Use Durable Objects for rate limit counters.

---

## 39) Appendix: Example UI changes
- Replace API key inputs with account-level settings.
- Add login/logout in header.
- Add cloud sync status badge.

---

## 40) Appendix: Compatibility notes
- Keep `mock` provider for demo mode.
- Preserve existing AI output schemas.
- Version schema responses for future changes.

---

## 41) Appendix: Security actions from REVIEW_AND_ROADMAP
- Revoke exposed keys and remove them from git history.
- Replace client admin code with server role enforcement.
- Remove localStorage usage for secrets.

---

## 42) End
- This document is the baseline backend implementation plan.
- Ready to proceed with scaffolding and iterative rollout.
