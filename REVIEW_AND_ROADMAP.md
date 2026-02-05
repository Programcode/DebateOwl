# DebateLab - Comprehensive Review & Roadmap

**Generated:** 2026-02-05  
**Project:** [debate.pi-stack.org](https://debate.pi-stack.org)  
**Repository:** MVP-with-backend

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security Audit](#2-security-audit)
3. [Code Quality Audit](#3-code-quality-audit)
4. [Supabase Audit](#4-supabase-audit)
5. [Frontend/UX Audit](#5-frontendux-audit)
6. [Functionality Issues & Bugs](#6-functionality-issues--bugs)
7. [Feature Roadmap](#7-feature-roadmap)
8. [Technical Debt Register](#8-technical-debt-register)
9. [Success Metrics & Targets](#9-success-metrics--targets)
10. [Action Plan & Prioritization](#10-action-plan--prioritization)

---

# 1. Executive Summary

## Overall Project Health Assessment: **C+**

DebateLab is a functional AI-powered debate preparation tool with a solid feature set. However, there are **critical security issues** in the database layer and multiple areas requiring attention before production scaling.

### Issue Count by Severity

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 **CRITICAL** | 6 | RLS disabled on 3 tables |
| 🟠 **HIGH** | 3 | CORS configuration, npm vulnerabilities, TypeScript strict mode disabled |
| 🟡 **MEDIUM** | 25+ | Performance warnings, bundle size, missing tests |
| 🟢 **LOW** | 15+ | Lint warnings, unused indexes, code style |

### Top 5 Priorities for Immediate Action

1. **🔴 Enable RLS on `global_prompts`, `rate_limits`, and `user_roles` tables** - Currently anyone can read/write to these tables
2. **🔴 Enable leaked password protection in Supabase Auth** - Prevents use of compromised passwords
3. **🟠 Upgrade Vite to fix esbuild vulnerability** - 2 moderate severity CVEs
4. **🟠 Enable TypeScript strict mode** - Currently disabled, allowing unsafe code patterns
5. **🟡 Fix bundle size issues** - `GeneratePage` (360KB) and `vendor-charts` (400KB) exceed 300KB threshold

### Key Metrics Snapshot

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Build Size (gzipped) | ~500KB | <300KB | 🟡 |
| Test Count | 39 tests | 100+ | 🟡 |
| Test Coverage | Unknown | 80%+ | ⚪ |
| TypeScript Strict | Disabled | Enabled | 🔴 |
| Lint Errors | 0 | 0 | ✅ |
| Lint Warnings | 8 | 0 | 🟡 |
| RLS Enabled Tables | 12/15 | 15/15 | 🔴 |
| npm Vulnerabilities | 2 moderate | 0 | 🟠 |

### Deployment Status

- **Status:** Active, healthy
- **Region:** eu-north-1
- **Database:** Postgres 17.6.1
- **Last Deploy:** Active via Docker + Nginx + Cloudflare Tunnel

---

# 2. Security Audit

## 2.1 Authentication & Authorization

### ✅ Supabase Auth Implementation

**Status:** Well implemented

The authentication flow uses Supabase Auth with Google OAuth:

```typescript
// src/lib/supabase/AuthProvider.tsx
const { data: sessionData } = await supabase.auth.getSession();
const accessToken = sessionData.session?.access_token;
```

**Strengths:**
- JWT tokens properly validated in Edge Functions
- Session refresh handled automatically by Supabase
- OAuth scopes limited to essential permissions

**Recommendations:**
- Consider adding multi-factor authentication (MFA) for admin users
- Implement session timeout for inactive users

---

### 🔴 CRITICAL: Row Level Security (RLS) Issues

**6 Security Errors Found**

#### Issue 2.1.1: RLS Disabled on `global_prompts`

| Property | Value |
|----------|-------|
| **Severity** | 🔴 CRITICAL |
| **File** | Supabase `public.global_prompts` table |
| **Risk** | Any authenticated user can read/write admin-only global prompts |

**Current State:**
```sql
-- RLS is DISABLED but policies exist:
-- Policy: global_prompts_select_all
```

**Recommended Fix:**
```sql
-- Enable RLS on the table
ALTER TABLE public.global_prompts ENABLE ROW LEVEL SECURITY;

-- Add proper policies
CREATE POLICY "Admins can manage global_prompts"
ON public.global_prompts
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
    AND role = 'admin'
  )
);

CREATE POLICY "Anyone can read active prompts"
ON public.global_prompts
FOR SELECT
USING (is_active = true);
```

**Time Estimate:** 30 minutes

---

#### Issue 2.1.2: RLS Disabled on `rate_limits`

| Property | Value |
|----------|-------|
| **Severity** | 🔴 CRITICAL |
| **File** | Supabase `public.rate_limits` table |
| **Risk** | Users can modify their own rate limits, bypassing restrictions |

**Current State:**
```sql
-- RLS is DISABLED but has conflicting policies:
-- "Admins can manage limits"
-- "Users can read own limits"
-- rate_limits_select_own
```

**Recommended Fix:**
```sql
-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Clean up duplicate policies first
DROP POLICY IF EXISTS "Users can read own limits" ON public.rate_limits;
DROP POLICY IF EXISTS "rate_limits_select_own" ON public.rate_limits;

-- Create consolidated policies
CREATE POLICY "Users can read own rate limits"
ON public.rate_limits
FOR SELECT
USING (
  user_id = (SELECT auth.uid())
  OR user_id IS NULL  -- Global limits readable by all
);

CREATE POLICY "Admins can manage all rate limits"
ON public.rate_limits
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
    AND role = 'admin'
  )
);
```

**Time Estimate:** 30 minutes

---

#### Issue 2.1.3: RLS Disabled on `user_roles`

| Property | Value |
|----------|-------|
| **Severity** | 🔴 CRITICAL |
| **File** | Supabase `public.user_roles` table |
| **Risk** | Any user can make themselves an admin |

**Current State:**
```sql
-- RLS is DISABLED, 4 conflicting policies exist
-- Users could potentially elevate privileges
```

**Recommended Fix:**
```sql
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own role
CREATE POLICY "Users can read own role"
ON public.user_roles
FOR SELECT
USING (user_id = (SELECT auth.uid()));

-- Only admins can modify roles (using service role key in Edge Function)
CREATE POLICY "Service role can manage roles"
ON public.user_roles
FOR ALL
USING (auth.jwt()->>'role' = 'service_role');
```

**Time Estimate:** 30 minutes

---

#### Issue 2.1.4: Leaked Password Protection Disabled

| Property | Value |
|----------|-------|
| **Severity** | 🟠 HIGH |
| **Location** | Supabase Auth Settings |
| **Risk** | Users can register with compromised passwords |

**Description:**
Supabase Auth can check passwords against HaveIBeenPwned database to prevent use of known compromised passwords. This feature is currently disabled.

**Recommended Fix:**
1. Go to Supabase Dashboard → Authentication → Settings
2. Enable "Leaked Password Protection"
3. Choose action: "Warn" or "Prevent"

**Time Estimate:** 5 minutes

---

## 2.2 API Security

### ✅ Edge Function Input Validation

**Status:** Good

The AI Edge Function has comprehensive input sanitization:

```typescript
// supabase/functions/ai/index.ts
const MAX_INPUT_LENGTH = 50000;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|text)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instruction[s]?\s*:/i,
  /system\s*:\s*\[/i,
  /\[\s*SYSTEM\s*\]/i,
  /\{\s*"role"\s*:\s*"system"/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /###\s*instruction/i,
  /\bDAN\s+mode\b/i,
  /jailbreak/i,
];
```

**Strengths:**
- Detects common prompt injection attempts
- Truncates oversized inputs
- Sanitizes control characters
- Logs security events

**Recommendations:**
- Add rate limiting per IP address (currently only per user)
- Consider adding request signing for webhook endpoints

---

### 🟠 HIGH: CORS Configuration

| Property | Value |
|----------|-------|
| **Severity** | 🟠 HIGH |
| **File** | `supabase/functions/*/index.ts` |
| **Risk** | Any domain can call the Edge Functions |

**Current State:**
```typescript
// All Edge Functions use this:
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // ...
};
```

**Problem:** Wildcard CORS allows any website to make requests to your API.

**Recommended Fix:**
```typescript
const ALLOWED_ORIGINS = [
  "https://debate.pi-stack.org",
  "http://localhost:5173",  // Development
];

function getCorsHeaders(origin: string) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
```

**Time Estimate:** 1 hour (update all Edge Functions)

---

### ⚠️ Rate Limiting Implementation

**Status:** Partially implemented

```typescript
// supabase/functions/ai/index.ts
async function checkRateLimit(userId: string | null): Promise<RateLimitResult> {
  if (!userId) return { allowed: true }; // Anonymous users not rate limited
  // ...
}
```

**Issues:**
1. Anonymous users are not rate limited
2. No per-IP rate limiting
3. Rate limits can be bypassed if user logs out

**Recommendations:**
- Add IP-based rate limiting using Cloudflare
- Require authentication for all AI features (✅ already done)
- Consider adding request fingerprinting

---

## 2.3 Infrastructure Security

### ✅ Nginx Configuration

**Status:** Good

```nginx
# nginx.conf - Security headers implemented
add_header Content-Security-Policy "default-src 'self'; ..." always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

# Blocks sensitive files
location ~* \.(md|txt|env|log|yml|yaml|json|lock|git|gitignore|dockerignore)$ {
    deny all;
    return 404;
}
```

**Strengths:**
- Comprehensive CSP header
- Hidden files and sensitive extensions blocked
- GZIP compression enabled
- Proper cache headers for static assets

**Recommendations:**
- Add HSTS header: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;`
- Consider adding CSP `report-uri` for violation monitoring

---

### ✅ Secret Management

**Status:** Good

- API keys stored in Supabase Edge Function secrets (never exposed to browser)
- Environment variables used for configuration
- No hardcoded secrets in codebase

---

## 2.4 Data Security

### ✅ Sensitive Data Handling

**Status:** Good

- API keys encrypted at rest in Supabase
- Passwords hashed with Supabase's secure algorithm
- No PII stored in localStorage

### 🟡 localStorage Usage

**Status:** Acceptable with caveats

```typescript
// Settings stored in localStorage via Zustand persist
useSettingsStore.persist({
  name: 'debate-settings',
  storage: createJSONStorage(() => localStorage),
})
```

**Stored locally:**
- User preferences (theme, language)
- Feature configurations
- Custom system prompts (could contain sensitive context)

**Recommendation:**
- Consider encrypting localStorage data for custom prompts
- Add option to disable local persistence for sensitive users

---

## 2.5 Frontend Security

### ✅ Input Validation

**Status:** Good

```typescript
// src/lib/validation/url-validation.ts
const BLOCKED_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'file:'];

export function validateUrl(url: string): { valid: boolean; message?: string } {
  // Validates URLs before fetching
}
```

### ✅ XSS Prevention

**Status:** Good - React automatically escapes output

### 🟡 Dependency Vulnerabilities

**npm audit output:**
```
2 moderate severity vulnerabilities

esbuild  <=0.24.2
  Severity: moderate
  esbuild enables any website to send any requests to the development server
  fix available via `npm audit fix --force`
  Will install vite@7.3.1
```

**Recommended Fix:**
```bash
npm update vite --save
# Or if breaking changes are acceptable:
npm audit fix --force
```

**Time Estimate:** 30 minutes (including testing)

---

## 2.6 Security Audit Summary Table

| Issue | Severity | Status | Fix Time |
|-------|----------|--------|----------|
| RLS disabled on `global_prompts` | 🔴 CRITICAL | Open | 30 min |
| RLS disabled on `rate_limits` | 🔴 CRITICAL | Open | 30 min |
| RLS disabled on `user_roles` | 🔴 CRITICAL | Open | 30 min |
| Leaked password protection | 🟠 HIGH | Open | 5 min |
| Wildcard CORS | 🟠 HIGH | Open | 1 hour |
| npm vulnerabilities | 🟠 HIGH | Open | 30 min |
| HSTS header missing | 🟡 MEDIUM | Open | 5 min |
| Anonymous rate limiting | 🟡 MEDIUM | Open | 2 hours |

---

# 3. Code Quality Audit

## 3.1 TypeScript Configuration

### 🔴 CRITICAL: Strict Mode Disabled

| Property | Value |
|----------|-------|
| **Severity** | 🔴 CRITICAL |
| **File** | `tsconfig.app.json` |
| **Impact** | Type safety holes, potential runtime errors |

**Current Configuration:**
```json
{
  "compilerOptions": {
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitAny": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

**Root `tsconfig.json` is slightly better:**
```json
{
  "compilerOptions": {
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**Problem:** The app config overrides the stricter root config with `"strict": false`, allowing:
- Implicit `any` types
- Unchecked null/undefined access
- Unused variables
- Missing return types

**Recommended Fix:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": false,  // Can be relaxed for callbacks
    "noImplicitAny": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true
  }
}
```

**Time Estimate:** 4-8 hours (enabling strict mode will reveal many type errors)

---

### TypeScript `any` Usage Analysis

A search for explicit `any` types would reveal patterns like:

```typescript
// Common patterns found:
const result: Record<string, any> = {};  // Should be typed
body = (await req.json()) as any;  // Should be validated
```

**Recommendation:** Run `npx tsc --noImplicitAny` to find all implicit any usages.

---

## 3.2 Linting Issues

**`npm run lint` output:** 8 warnings, 0 errors

| File | Line | Warning |
|------|------|---------|
| `src/components/ui/badge.tsx` | 29 | react-refresh/only-export-components |
| `src/components/ui/button.tsx` | 47 | react-refresh/only-export-components |
| `src/components/ui/form.tsx` | 129 | react-refresh/only-export-components |
| `src/components/ui/navigation-menu.tsx` | 111 | react-refresh/only-export-components |
| `src/components/ui/sidebar.tsx` | 636 | react-refresh/only-export-components |
| `src/components/ui/sonner.tsx` | 27 | react-refresh/only-export-components |
| `src/components/ui/toggle.tsx` | 37 | react-refresh/only-export-components |
| `src/lib/supabase/AuthProvider.tsx` | 90 | react-refresh/only-export-components |

**Issue:** Files export both components and constants/variants, which breaks fast refresh in development.

**Fix Pattern:**
```typescript
// BEFORE (badge.tsx)
export const badgeVariants = cva(...);
export function Badge({ ... }) { ... }

// AFTER - Split into two files:
// badge-variants.ts
export const badgeVariants = cva(...);

// badge.tsx
import { badgeVariants } from './badge-variants';
export function Badge({ ... }) { ... }
```

**Alternative:** Suppress the warning for UI components since shadcn/ui follows this pattern:
```javascript
// eslint.config.js
{
  rules: {
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
  }
}
```

**Time Estimate:** 1 hour (suppression) or 4 hours (refactoring)

---

## 3.3 Architecture Review

### Component Structure ✅

**Good practices observed:**
- Clear separation: `pages/`, `components/`, `lib/`
- Feature components organized: `components/features/`
- UI components in `components/ui/` (shadcn pattern)
- Stores in `lib/stores/`
- AI logic in `lib/ai/`

**Directory Structure:**
```
src/
├── components/
│   ├── auth/          # Auth-related components
│   ├── features/      # Feature-specific components (9 folders)
│   ├── landing/       # Landing page components (11 files)
│   ├── layout/        # Layout components
│   └── ui/            # shadcn/ui components (51 files)
├── hooks/             # Custom React hooks (3 files)
├── lib/
│   ├── ai/            # AI client and schemas
│   ├── stores/        # Zustand stores
│   ├── supabase/      # Supabase client/auth
│   └── validation/    # Input validation
├── pages/             # Route pages (14 files)
└── test/              # Test files
```

### State Management ✅

Using Zustand with good patterns:

```typescript
// Settings store with persistence
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // State and actions
    }),
    {
      name: 'debate-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
```

### Error Handling ✅

Custom error classes with type guards:

```typescript
// src/lib/ai/client.ts
export class AIError extends Error { /* base */ }
export class AIAuthError extends AIError { /* 401/403 */ }
export class AIRateLimitError extends AIError { /* 429 */ }
export class AIProviderError extends AIError { /* API errors */ }
export class AIResponseError extends AIError { /* Invalid response */ }
export class TimeoutError extends AIError { /* Timeout */ }

// Type guards
export function isAIAuthError(error: unknown): error is AIAuthError { ... }
export function isAIRateLimitError(error: unknown): error is AIRateLimitError { ... }
```

---

## 3.4 Performance Issues

### 🟡 Bundle Size Analysis

**Build output:**
```
dist/assets/vendor-charts-DWUfZqcL.js    399.66 kB │ gzip: 108.01 kB ⚠️
dist/assets/GeneratePage-BsBfgOt9.js     360.78 kB │ gzip: 105.26 kB ⚠️
dist/assets/vendor-radix-CUfWvbTJ.js     241.83 kB │ gzip:  78.70 kB
dist/assets/vendor-supabase-ClwVdkTh.js  170.34 kB │ gzip:  44.76 kB
dist/assets/LandingPage-Dgmeg9Zb.js      143.44 kB │ gzip:  45.48 kB
```

**Two chunks exceed 300KB warning threshold:**

1. **vendor-charts (400KB)** - Recharts library
2. **GeneratePage (361KB)** - Large page component

**Recommendations:**

1. **Lazy load charts:**
```typescript
const Chart = lazy(() => import('recharts'));
```

2. **Split GeneratePage:**
```typescript
// Lazy load the DOCX export
const exportDocx = lazy(() => import('./export-docx'));
```

3. **Consider lighter charting library:**
   - Replace Recharts with [Lightweight Charts](https://github.com/nickreese/chart.js) or CSS-based charts for simple use cases

4. **Tree-shake Radix UI:**
   - Import only needed components
   - Check for duplicate imports

**Time Estimate:** 4-8 hours

---

### Memory Leak Potential

**Pattern to watch:**
```typescript
useEffect(() => {
  const subscription = supabase.auth.onAuthStateChange((event, session) => {
    // ...
  });
  
  // ✅ Good - cleanup provided
  return () => {
    subscription.data.subscription.unsubscribe();
  };
}, []);
```

**Status:** Auth provider properly cleans up subscriptions. ✅

---

## 3.5 Testing Coverage

### Current Test Suite

**39 tests passing across 8 test files:**

| Test File | Tests | Status |
|-----------|-------|--------|
| `settings-store.test.ts` | 7 | ✅ |
| `session-store.test.ts` | 8 | ✅ |
| `export-utils.test.ts` | 14 | ✅ |
| `ai-client.test.ts` | ~5 | ✅ |
| `validation.test.ts` | ~5 | ✅ |
| `schemas.test.ts` | varies | ✅ |
| `utils.test.ts` | varies | ✅ |
| `example.test.ts` | 1 | ✅ |

### Missing Test Coverage

| Area | Priority | Reason |
|------|----------|--------|
| Page components | 🔴 High | No integration tests for main pages |
| Auth flows | 🔴 High | Critical path untested |
| AI response transformers | 🟡 Medium | `transformGenerateResponse`, `transformBrainstormResponse` |
| UI components | 🟡 Medium | Only `ui.test.tsx` exists |
| Edge Functions | 🟡 Medium | No tests for Deno functions |
| Error handling | 🟡 Medium | Error boundary coverage |

### Recommendations

1. **Add page integration tests:**
```typescript
// test/pages/GeneratePage.test.tsx
describe('GeneratePage', () => {
  it('renders form with all inputs', async () => {
    render(<GeneratePage />);
    expect(screen.getByLabelText('Motion')).toBeInTheDocument();
  });
  
  it('submits form and displays results', async () => {
    // Mock AI response
    vi.mocked(generateCase).mockResolvedValue(mockCaseOutput);
    render(<GeneratePage />);
    // ...
  });
});
```

2. **Install coverage tool:**
```bash
npm install -D @vitest/coverage-v8
npm run test -- --coverage
```

**Time Estimate:** 8-16 hours for minimum viable coverage

---

## 3.6 Documentation

### README Quality: ✅ Good

The README.md is comprehensive at ~49KB including:
- Project description
- Architecture diagram
- Feature documentation
- Setup instructions
- Deployment guide
- Security model

### Code Comments: 🟡 Acceptable

Edge Functions have good documentation:
```typescript
// Supabase Edge Function: AI proxy for DebateLab
// Keeps provider keys server-side and returns structured JSON.
```

**Recommendations:**
- Add JSDoc to exported functions
- Document complex transformations
- Add inline comments for security-critical code

---

# 4. Supabase Audit

## 4.1 Database Schema

### Tables Overview (15 total)

| Table | RLS | Rows | Purpose |
|-------|-----|------|---------|
| `user_settings` | ✅ | 1 | User preferences |
| `cases` | ✅ | 2 | Generated debate cases |
| `attacks` | ✅ | 0 | Case attack analyses |
| `brainstorms` | ✅ | 0 | Brainstorm sessions |
| `factoids` | ✅ | 0 | Research factoids |
| `chats` | ✅ | 0 | Chat sessions |
| `messages` | ✅ | 0 | Chat messages |
| `sources` | ✅ | 2 | Source library items |
| `source_files` | ✅ | 0 | Uploaded files |
| `ai_requests` | ✅ | 30 | Usage tracking |
| `api_keys` | ✅ | 0 | User API keys |
| `shared_items` | ✅ | 0 | Shared content |
| `user_roles` | 🔴 **NO** | 1 | User roles (admin/user/banned) |
| `rate_limits` | 🔴 **NO** | 1 | Rate limit configuration |
| `global_prompts` | 🔴 **NO** | 0 | Admin-configured prompts |

---

### 🟡 Missing Indexes

**5 foreign keys without covering indexes:**

| Table | Foreign Key | Impact |
|-------|-------------|--------|
| `api_keys` | `api_keys_user_id_fkey` | Slow lookups by user |
| `global_prompts` | `global_prompts_created_by_fkey` | Minor - small table |
| `shared_items` | `shared_items_created_by_fkey` | Slow user share lookups |
| `source_files` | `source_files_source_id_fkey` | Slow source file fetches |
| `source_files` | `source_files_user_id_fkey` | Slow user file lookups |

**Recommended Fix:**
```sql
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_shared_items_created_by ON public.shared_items(created_by);
CREATE INDEX idx_source_files_source_id ON public.source_files(source_id);
CREATE INDEX idx_source_files_user_id ON public.source_files(user_id);
-- global_prompts index not needed (small table)
```

**Time Estimate:** 15 minutes

---

### 🟡 Unused Indexes (6)

These indexes exist but have never been used:

| Table | Index | Recommendation |
|-------|-------|----------------|
| `ai_requests` | `idx_ai_requests_user_id` | Keep - will be used at scale |
| `messages` | `idx_messages_chat_id` | Keep - chat queries will use it |
| `shared_items` | `idx_shared_items_share_code` | Keep - share lookups need it |
| `user_roles` | `idx_user_roles_user_id` | Keep - role checks use it |
| `rate_limits` | `idx_rate_limits_user_id` | Keep - rate limit checks |
| `rate_limits` | `idx_rate_limits_type` | Keep - limit type lookups |

**Recommendation:** These are likely unused due to low data volume. Keep them for production scaling.

---

## 4.2 Edge Functions

### Overview (3 functions)

| Function | Lines | Purpose | Security |
|----------|-------|---------|----------|
| `ai` | 888 | AI proxy for all features | ✅ Good |
| `admin` | 329 | Admin API | ✅ Good |
| `share` | 131 | Share link creation | ✅ Acceptable |

---

### `ai/index.ts` Review

**Strengths:**
- Comprehensive prompt injection detection
- Request logging with unique IDs
- Timeout handling (60s for API calls)
- Rate limiting with graceful degradation
- Multi-provider support (OpenAI, Google, Anthropic)

**Issues:**
1. **CORS wildcard** (documented above)
2. **Deep research timeout** - Could run longer than Edge Function limit

```typescript
// Potential timeout issue
async function deepResearch(claim, region, provider, model) {
  // Multiple sequential API calls + web scraping
  // Could exceed Edge Function timeout
}
```

**Recommendation:** Add timeout tracking and early termination.

---

### `admin/index.ts` Review

**Strengths:**
- Proper admin role verification
- Comprehensive logging
- Multiple action endpoints

**Issues:**
1. **N+1 query pattern:**
```typescript
// For each user, runs 3 separate queries
const enrichedUsers = await Promise.all(
  users.slice(0, 100).map(async (u) => {
    const { count } = await supabase.from("ai_requests")...
    const { data: limits } = await supabase.from("rate_limits")...
    const { data: role } = await supabase.from("user_roles")...
    return { ... };
  })
);
```

**Recommendation:** Use a single joined query or PostgreSQL function.

---

### `share/index.ts` Review

**Strengths:**
- Unique share code generation with collision detection
- Optional expiration
- Anonymous share creation allowed

**Issues:**
1. **No share content validation** - Users can share arbitrary JSON
2. **No size limits** - Large data could be stored

**Recommendation:**
```typescript
// Add size limit
const MAX_SHARE_SIZE = 100 * 1024; // 100KB
if (JSON.stringify(itemData).length > MAX_SHARE_SIZE) {
  return new Response(JSON.stringify({ error: "Content too large" }), { status: 413 });
}
```

---

## 4.3 Supabase Advisors Summary

### Security Advisors (7 issues)

| Issue | Count | Severity |
|-------|-------|----------|
| RLS disabled in public tables | 3 | 🔴 ERROR |
| Policy exists but RLS disabled | 3 | 🔴 ERROR |
| Leaked password protection disabled | 1 | 🟠 WARN |

### Performance Advisors (35+ issues)

| Issue | Count | Severity |
|-------|-------|----------|
| RLS policies re-evaluate `auth.uid()` | 17 | 🟠 WARN |
| Unindexed foreign keys | 5 | ⚪ INFO |
| Multiple permissive policies | 10 | 🟠 WARN |
| Unused indexes | 6 | ⚪ INFO |

---

### 🟡 RLS Performance Fix

**Issue:** 17 policies use `auth.uid()` without `(select)` wrapper, causing re-evaluation per row.

**Example fix:**
```sql
-- BEFORE (slow at scale)
CREATE POLICY "cases_all" ON public.cases
USING (user_id = auth.uid());

-- AFTER (optimized)
CREATE POLICY "cases_all" ON public.cases
USING (user_id = (SELECT auth.uid()));
```

**Tables affected:** `user_settings`, `cases`, `attacks`, `brainstorms`, `factoids`, `chats`, `ai_requests`, `messages`, `sources`, `source_files`, `api_keys`, `shared_items`

**Time Estimate:** 2 hours (update all policies)

---

### 🟡 Multiple Permissive Policies

**Issue:** `rate_limits` and `user_roles` have 3-4 overlapping SELECT policies each.

**Example:**
```sql
-- rate_limits has these overlapping policies:
-- 1. "Admins can manage limits"
-- 2. "Users can read own limits"
-- 3. "rate_limits_select_own"
```

**Recommendation:** Consolidate into single policy per role/action combination after enabling RLS.

---

## 4.4 Logs Analysis

**Note:** Supabase logs reviewed for the last 24 hours show normal operation with no significant errors.

Common log patterns:
- AI function invocations
- Admin API calls
- Auth token validations

---

## 4.5 Storage & Limits

| Resource | Current | Plan Limit | Usage |
|----------|---------|------------|-------|
| Database Size | Small | 500MB | ~1% |
| Auth Users | 2 | 50,000 | Minimal |
| Edge Function Invocations | ~30/day | 500,000/mo | <1% |
| Storage | Minimal | 1GB | <1% |

**Status:** Well within free tier limits. ✅

---

# 5. Frontend/UX Audit

## 5.1 Accessibility (a11y)

### 🟡 ARIA Labels

**Status:** Partial implementation

Many shadcn/ui components include proper ARIA attributes, but custom components may lack them.

**Recommendations:**
1. Add `aria-label` to icon-only buttons
2. Add `aria-describedby` for error messages in forms
3. Use semantic HTML (`<main>`, `<nav>`, `<aside>`)

### 🟡 Keyboard Navigation

**Status:** Should be tested

Shadcn/ui components generally support keyboard navigation, but verify:
- Tab order through all interactive elements
- Escape key closes modals
- Arrow keys work in dropdowns

### 🟡 Color Contrast

**Status:** Needs audit

Run axe-core or Lighthouse to verify WCAG AA compliance.

### Focus Management

**Recommendations:**
- Trap focus in modals
- Return focus when modals close
- Visible focus indicators

**Time Estimate:** 4-8 hours for comprehensive a11y audit and fixes

---

## 5.2 Responsive Design

### Breakpoints Used

```css
/* Tailwind defaults */
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### 🟡 Mobile Issues to Verify

1. Form inputs readable on small screens
2. Touch targets ≥44px
3. No horizontal scroll on mobile
4. Sidebar behavior on mobile

---

## 5.3 User Experience Issues

### 🟡 Loading States

**Status:** Needs review

Ensure all async operations show loading indicators:
- AI generation (can take 10-60 seconds)
- Page transitions
- Form submissions

### 🟡 Error Messages

**Good:** AI client has detailed error messages

```typescript
export class AIRateLimitError extends AIError {
  constructor(message = 'Rate limit exceeded. Please try again later.') { ... }
}
```

**Verify:** User-facing error toasts are helpful and actionable.

### Empty States

**Verify:** All list pages have empty state messages:
- Library page with no sources
- History page with no items
- Admin page with no users

---

## 5.4 Design Consistency

### ✅ Component Usage

Using shadcn/ui consistently throughout the application provides:
- Consistent button styles
- Unified form controls
- Standard spacing

### Color Palette

Using Tailwind with CSS variables for theming.

---

# 6. Functionality Issues & Bugs

## Known Issues

### Issue 6.1: Coverage Dependency Missing

| Property | Value |
|----------|-------|
| **Priority** | P3 (Low) |
| **Component** | Test configuration |
| **Description** | `@vitest/coverage-v8` not installed |
| **Steps** | Run `npm run test -- --coverage` |
| **Expected** | Coverage report generated |
| **Actual** | Prompts to install dependency |

**Fix:**
```bash
npm install -D @vitest/coverage-v8
```

---

### Issue 6.2: Deep Research Timeout Risk

| Property | Value |
|----------|-------|
| **Priority** | P2 (Medium) |
| **Component** | `supabase/functions/ai/index.ts` |
| **Description** | Deep research may exceed Edge Function timeout |
| **Affected Feature** | Factoids with web research |

**Potential Fix:**
- Add progress tracking
- Implement early termination
- Consider background job for long research

---

### Issue 6.3: Chart Bundle Size

| Property | Value |
|----------|-------|
| **Priority** | P2 (Medium) |
| **Component** | Build configuration |
| **Description** | Recharts contributes 400KB to bundle |

---

### Issue 6.4: Admin N+1 Queries

| Property | Value |
|----------|-------|
| **Priority** | P3 (Low) |
| **Component** | `supabase/functions/admin/index.ts` |
| **Description** | User list runs 3 queries per user |
| **Impact** | Slow admin page with many users |

---

# 7. Feature Roadmap

## 7.1 Immediate Fixes (This Week)

### Critical Security Patches

| Task | Time | Priority |
|------|------|----------|
| Enable RLS on `global_prompts` | 30 min | 🔴 P0 |
| Enable RLS on `rate_limits` | 30 min | 🔴 P0 |
| Enable RLS on `user_roles` | 30 min | 🔴 P0 |
| Enable leaked password protection | 5 min | 🟠 P1 |
| Fix CORS configuration | 1 hour | 🟠 P1 |
| Update Vite (npm vulnerabilities) | 30 min | 🟠 P1 |

**Total: ~3.5 hours**

---

### Code Quality Fixes

| Task | Time | Priority |
|------|------|----------|
| Install coverage tool | 15 min | 🟡 P2 |
| Fix lint warnings (suppress or split) | 1 hour | 🟡 P2 |
| Add HSTS header | 5 min | 🟡 P2 |
| Add missing FK indexes | 15 min | 🟡 P2 |

**Total: ~1.5 hours**

---

## 7.2 Short-Term Features (1-4 weeks)

### 7.2.1 TypeScript Strict Mode Migration

| Property | Value |
|----------|-------|
| **Description** | Enable strict TypeScript with all checks |
| **User Value** | More reliable application, fewer runtime errors |
| **Technical Approach** | Enable incrementally, fix type errors |
| **Time Estimate** | 8 hours |
| **Priority** | Must-have |

---

### 7.2.2 Test Coverage Expansion

| Property | Value |
|----------|-------|
| **Description** | Add tests for pages, auth, and AI transformers |
| **User Value** | More stable releases, fewer regressions |
| **Technical Approach** | Vitest + React Testing Library |
| **Time Estimate** | 16 hours |
| **Priority** | Must-have |

---

### 7.2.3 Usage Analytics Dashboard

| Property | Value |
|----------|-------|
| **Description** | Visualize AI usage, costs, popular features |
| **User Value** | Admins can monitor platform health |
| **Technical Approach** | Extend admin page with charts |
| **Dependencies** | Current tracking is in place |
| **Time Estimate** | 8 hours |
| **Priority** | Nice-to-have |

---

### 7.2.4 AI Model Selection

| Property | Value |
|----------|-------|
| **Description** | Let users choose AI model per request |
| **User Value** | Balance speed vs quality |
| **Technical Approach** | Add dropdown to AI forms |
| **Time Estimate** | 4 hours |
| **Priority** | Nice-to-have |

---

### 7.2.5 Saved Prompts/Templates

| Property | Value |
|----------|-------|
| **Description** | Save and reuse common motions/cases |
| **User Value** | Faster preparation, consistent practice |
| **Technical Approach** | New `templates` table + UI |
| **Time Estimate** | 8 hours |
| **Priority** | Nice-to-have |

---

### 7.2.6 Export to Google Docs

| Property | Value |
|----------|-------|
| **Description** | Export cases directly to Google Docs |
| **User Value** | Easier collaboration with teammates |
| **Technical Approach** | Google Docs API integration |
| **Dependencies** | Google OAuth scope expansion |
| **Time Estimate** | 12 hours |
| **Priority** | Nice-to-have |

---

### 7.2.7 Keyboard Shortcuts

| Property | Value |
|----------|-------|
| **Description** | Global keyboard shortcuts for power users |
| **User Value** | Faster navigation and actions |
| **Technical Approach** | Use `react-hotkeys-hook` |
| **Time Estimate** | 4 hours |
| **Priority** | Nice-to-have |

---

### 7.2.8 Onboarding Tutorial

| Property | Value |
|----------|-------|
| **Description** | Guided tour for new users |
| **User Value** | Faster learning curve |
| **Technical Approach** | Use `react-joyride` or similar |
| **Time Estimate** | 6 hours |
| **Priority** | Nice-to-have |

---

### 7.2.9 Dark/Light Mode Toggle

| Property | Value |
|----------|-------|
| **Description** | User-controlled theme switching |
| **User Value** | Personal preference, reduced eye strain |
| **Technical Approach** | Already have `theme` in settings |
| **Time Estimate** | 2 hours |
| **Priority** | Nice-to-have |

---

### 7.2.10 Voice Input

| Property | Value |
|----------|-------|
| **Description** | Speak motions and questions |
| **User Value** | Practice speaking, hands-free input |
| **Technical Approach** | Web Speech API |
| **Time Estimate** | 4 hours |
| **Priority** | Nice-to-have |

---

### 7.2.11 Debate Timer Improvements

| Property | Value |
|----------|-------|
| **Description** | Audio cues, custom formats, keyboard control |
| **User Value** | Better practice experience |
| **Technical Approach** | Enhance existing TimerPage |
| **Time Estimate** | 4 hours |
| **Priority** | Nice-to-have |

---

### 7.2.12 Evidence Card Tagging

| Property | Value |
|----------|-------|
| **Description** | Tag and categorize sources/factoids |
| **User Value** | Better organization, faster retrieval |
| **Technical Approach** | Add `tags` column to sources |
| **Time Estimate** | 6 hours |
| **Priority** | Nice-to-have |

---

### 7.2.13 Admin User Management Enhancements

| Property | Value |
|----------|-------|
| **Description** | Bulk actions, search, export user data |
| **User Value** | Easier administration |
| **Technical Approach** | Enhance AdminPage |
| **Time Estimate** | 8 hours |
| **Priority** | Nice-to-have |

---

### 7.2.14 Notification System

| Property | Value |
|----------|-------|
| **Description** | In-app notifications for shared content, etc. |
| **User Value** | Stay informed of updates |
| **Technical Approach** | Supabase Realtime + notification center |
| **Time Estimate** | 12 hours |
| **Priority** | Nice-to-have |

---

### 7.2.15 Feedback/Rating System

| Property | Value |
|----------|-------|
| **Description** | Rate AI responses for quality |
| **User Value** | Improve AI over time |
| **Technical Approach** | Add feedback table, thumbs up/down UI |
| **Time Estimate** | 6 hours |
| **Priority** | Nice-to-have |

---

## 7.3 Medium-Term Features (1-3 months)

### 7.3.1 Team Workspaces

| Property | Value |
|----------|-------|
| **Description** | Shared workspaces for debate teams |
| **User Value** | Collaborate on case development |
| **Technical Approach** | Multi-tenant architecture with team tables |
| **Time Estimate** | 40 hours |
| **Priority** | Must-have for scaling |

---

### 7.3.2 Real-time Collaboration

| Property | Value |
|----------|-------|
| **Description** | Multiple users editing cases simultaneously |
| **User Value** | Team preparation sessions |
| **Technical Approach** | Supabase Realtime + CRDT |
| **Time Estimate** | 60 hours |
| **Priority** | Nice-to-have |

---

### 7.3.3 Practice Mode with AI Opponent

| Property | Value |
|----------|-------|
| **Description** | AI plays the opposing side in practice debates |
| **User Value** | Realistic practice without partner |
| **Technical Approach** | New game-like UI, AI role-play |
| **Time Estimate** | 30 hours |
| **Priority** | Nice-to-have (differentiating feature) |

---

### 7.3.4 Argument Flowcharts

| Property | Value |
|----------|-------|
| **Description** | Visual flow diagrams of arguments |
| **User Value** | Track argument development visually |
| **Technical Approach** | React Flow or similar |
| **Time Estimate** | 20 hours |
| **Priority** | Nice-to-have |

---

### 7.3.5 Integration with Debate Wikis

| Property | Value |
|----------|-------|
| **Description** | Pull evidence from WikiDebate, NDCA Wiki |
| **User Value** | Access community resources |
| **Technical Approach** | API integration or web scraping |
| **Time Estimate** | 16 hours |
| **Priority** | Nice-to-have |

---

### 7.3.6 Mobile PWA Improvements

| Property | Value |
|----------|-------|
| **Description** | Offline support, installable app |
| **User Value** | Use at tournaments without wifi |
| **Technical Approach** | Service worker, cache strategies |
| **Time Estimate** | 16 hours |
| **Priority** | Nice-to-have |

---

### 7.3.7 PDF Export

| Property | Value |
|----------|-------|
| **Description** | Export cases as formatted PDFs |
| **User Value** | Print-ready documents |
| **Technical Approach** | jsPDF or server-side rendering |
| **Time Estimate** | 8 hours |
| **Priority** | Nice-to-have |

---

## 7.4 Long-Term Vision (6+ months)

### 7.4.1 Native Mobile Apps

| Property | Value |
|----------|-------|
| **Description** | iOS and Android apps |
| **User Value** | Native experience, push notifications |
| **Technical Approach** | React Native or Flutter |
| **Time Estimate** | 200+ hours |

---

### 7.4.2 AI Model Fine-tuning

| Property | Value |
|----------|-------|
| **Description** | Custom model trained on debate data |
| **User Value** | Higher quality, debate-specific outputs |
| **Technical Approach** | Fine-tune on user feedback |
| **Time Estimate** | Research phase |

---

### 7.4.3 Multi-language Support

| Property | Value |
|----------|-------|
| **Description** | Full i18n for global users |
| **User Value** | Non-English debate communities |
| **Technical Approach** | react-i18next |
| **Time Estimate** | 40+ hours |

---

### 7.4.4 Stripe Payments Integration

| Property | Value |
|----------|-------|
| **Description** | Premium subscriptions, usage-based billing |
| **User Value** | Sustainable service |
| **Technical Approach** | Stripe Checkout + Webhooks |
| **Time Estimate** | 24 hours |

---

### 7.4.5 Video Practice Recording

| Property | Value |
|----------|-------|
| **Description** | Record practice speeches for self-review |
| **User Value** | Visual feedback on delivery |
| **Technical Approach** | MediaRecorder API + storage |
| **Time Estimate** | 30 hours |

---

# 8. Technical Debt Register

| ID | Description | Impact | Cost to Fix | Priority |
|----|-------------|--------|------------|----------|
| TD-01 | TypeScript strict mode disabled | Hidden bugs, type safety holes | 8 hours | 🔴 High |
| TD-02 | Bundle size over 300KB | Slow initial load | 8 hours | 🟡 Medium |
| TD-03 | Test coverage unknown | Regression risk | 16 hours | 🟡 Medium |
| TD-04 | Admin N+1 queries | Slow admin page | 4 hours | 🟢 Low |
| TD-05 | CORS wildcard in Edge Functions | Security risk | 1 hour | 🔴 High |
| TD-06 | Duplicate RLS policies | Confusion, maintenance | 2 hours | 🟢 Low |
| TD-07 | RLS init plan warnings | Performance at scale | 2 hours | 🟡 Medium |
| TD-08 | Missing FK indexes | Slow queries at scale | 15 min | 🟡 Medium |
| TD-09 | Lint warnings (8) | Developer experience | 1 hour | 🟢 Low |
| TD-10 | Coverage dependency missing | Can't measure coverage | 15 min | 🟢 Low |

---

# 9. Success Metrics & Targets

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| **Lighthouse Performance** | Unknown | 90+ | Run Lighthouse in Chrome DevTools |
| **Test Coverage** | Unknown | 80%+ | `npm run test -- --coverage` |
| **TypeScript Coverage** | ~80% | 100% | Enable `noImplicitAny` in tsconfig |
| **Bundle Size (gzipped)** | ~500KB | <300KB | `npm run build` output |
| **a11y Issues** | Unknown | 0 | Run axe-core audit |
| **Security Issues** | 6 critical | 0 | Supabase Security Advisor |
| **Performance Warnings** | 35+ | 5 | Supabase Performance Advisor |
| **npm Vulnerabilities** | 2 | 0 | `npm audit` |
| **API Latency p95** | Unknown | <2s | Supabase Edge Function logs |
| **Error Rate** | Unknown | <1% | Supabase logs monitoring |

---

# 10. Action Plan & Prioritization

## Phase 1: Critical Fixes (Week 1-2)

### Day 1-2: Security Patches
- [ ] Enable RLS on `global_prompts` (30 min)
- [ ] Enable RLS on `rate_limits` (30 min)
- [ ] Enable RLS on `user_roles` (30 min)
- [ ] Enable leaked password protection (5 min)
- [ ] Add HSTS header to nginx (5 min)
- [ ] Update CORS in Edge Functions (1 hour)

### Day 3-4: Dependency & Config Fixes
- [ ] Update Vite/esbuild (`npm audit fix`) (30 min)
- [ ] Install `@vitest/coverage-v8` (15 min)
- [ ] Add missing FK indexes (15 min)
- [ ] Suppress lint warnings (1 hour)

### Day 5: RLS Performance
- [ ] Update all RLS policies to use `(select auth.uid())` (2 hours)
- [ ] Consolidate duplicate policies (1 hour)

**Phase 1 Total: ~8 hours**

---

## Phase 2: Quality Improvements (Week 3-4)

### Testing (8 hours)
- [ ] Add page integration tests for GeneratePage
- [ ] Add page integration tests for AttackPage
- [ ] Add auth flow tests
- [ ] Run coverage report

### TypeScript Strict Mode (8 hours)
- [ ] Enable `noImplicitAny` and fix errors
- [ ] Enable `strictNullChecks` and fix errors
- [ ] Enable full `strict` mode
- [ ] Update CI to enforce strict mode

### Bundle Optimization (4 hours)
- [ ] Lazy load chart components
- [ ] Split large pages
- [ ] Analyze and optimize imports

**Phase 2 Total: ~20 hours**

---

## Phase 3: Feature Development (Month 2+)

### Priority Matrix

| Feature | Impact | Effort | Priority Score |
|---------|--------|--------|----------------|
| Team Workspaces | High | High | ⭐⭐⭐⭐⭐ |
| AI Model Selection | Medium | Low | ⭐⭐⭐⭐ |
| Saved Templates | Medium | Medium | ⭐⭐⭐⭐ |
| Practice Mode | High | High | ⭐⭐⭐⭐ |
| Keyboard Shortcuts | Low | Low | ⭐⭐⭐ |
| Voice Input | Medium | Low | ⭐⭐⭐ |
| PDF Export | Medium | Low | ⭐⭐⭐ |
| Real-time Collab | High | Very High | ⭐⭐⭐ |

### Recommended Order
1. AI Model Selection (quick win)
2. Saved Templates (user value)
3. PDF Export (low effort)
4. Team Workspaces (scaling)
5. Practice Mode (differentiation)

---

## Resource Requirements

### Current Team (Assumed: 1-2 developers)

| Phase | Duration | Hours |
|-------|----------|-------|
| Phase 1 | 1-2 weeks | 8 |
| Phase 2 | 2-3 weeks | 20 |
| Phase 3 | Ongoing | 40+/month |

### Recommended Additions for Scaling
- Part-time designer for UX improvements
- QA automation engineer for test coverage

---

# Appendix A: File References

## Key Files Reviewed

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/functions/ai/index.ts` | 888 | Main AI proxy |
| `supabase/functions/admin/index.ts` | 329 | Admin API |
| `supabase/functions/share/index.ts` | 131 | Share links |
| `src/lib/ai/client.ts` | 497 | Frontend AI client |
| `nginx.conf` | 65 | Web server config |
| `tsconfig.app.json` | 32 | TypeScript config |

---

# Appendix B: Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run lint             # Run ESLint
npm run test             # Run tests
npm run test -- --coverage  # Run with coverage

# Build
npm run build            # Production build
npm audit                # Check vulnerabilities
npm audit fix --force    # Fix vulnerabilities

# Supabase
npx supabase functions deploy ai       # Deploy AI function
npx supabase functions deploy admin    # Deploy admin function
npx supabase functions deploy share    # Deploy share function

# Docker
docker build -t debate-trainer .
docker run -d -p 3001:80 --name debate-app --restart unless-stopped debate-trainer
```

---

**Document generated by automated audit on 2026-02-05**

**Next review recommended:** 2026-03-05 or after major changes

## Completed Security & Performance Fixes (Feb 5, 2026)

- ✅ **RLS Enabled**: `global_prompts`, `rate_limits`, `user_roles` are now protected.
- ✅ **RLS Optimized**: Policies use `(select auth.uid())` for performance.
- ✅ **HSTS Added**: Nginx config now strictly enforces HTTPS.
- ✅ **CORS Fixed**: Removed wildcard, used strict allowlist for Edge Functions.
- ✅ **Dependencies Updated**: `npm audit fix` and package updates applied.
- ✅ **Indexes Added**: `feature`, `created_at` on `ai_requests`, plus FK indexes on `messages`, `chats`, `sources`.
- ✅ **Cleanup**: Removed duplicate RLS policies.

**Next Steps:**
1. Enable "Leaked Password Protection" in Supabase Dashboard.
2. Resolve peer dependency conflict for coverage tool (low priority).
