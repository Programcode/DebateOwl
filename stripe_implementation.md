# Stripe Subscription & Promo Code Implementation Plan

## 1. Project Overview & Goals

**Objective:** Transform DebateLab into a sustainable freemium platform with a $5/month Pro tier, while maintaining a robust free tier (5/day) and a flexible promo code system for partners/demos.

**Key Constraints & Rules:**
- **Trial Tier:** 3-Day Access with 5 AI requests/day (resets at Midnight UTC).
- **Pro Tier ($5/mo):** 50 AI requests/day + Access to Advanced Models (Claude 3.5 Sonnet+, GPT-4o, Gemini 1.5 Pro).
- **Expired Status:** After 3 days, access is revoked (0 requests/day) unless user upgrades.
- **Existing Users:** 1-month grace period before limits apply.
- **Promo Codes:** Advanced system for overrides (extended trial, extra daily limits, discounts).
- **Tech Stack:** React/Vite (Frontend) + Supabase Edge Functions (Backend) + Stripe (Payments).
- **Platform:** Web only.
- **Tax:** Stripe Tax enabled (added on top of $5 base price).

---

## 2. Manual Setup Guide (For You)

> [!IMPORTANT]
> Follow these steps in your Stripe Dashboard *before* we deploy any code.

### 2.1 Stripe Account & Keys
1.  **Log in to [Stripe Dashboard](https://dashboard.stripe.com/).**
2.  **Activate Payments** (if not already done) by verifying business details.
3.  **Get API Keys:**
    -   Go to **Developers** -> **API keys**.
    -   Copy `Publishable key` (starts with `pk_test_...` or `pk_live_...`).
    -   Copy `Secret key` (starts with `sk_test_...` or `sk_live_...`).
    -   *Save these for your `.env` and Supabase Secrets.*

### 2.2 Create the "$5 Pro Subscription" Product
1.  Go to **Products** -> **Add Product**.
2.  **Name:** `DebateLab Pro`.
3.  **Description:** `Pro access with 50 daily requests and advanced AI models.`
4.  **Image:** Update a logo if desired.
5.  **Pricing Information:**
    -   **Pricing Model:** Standard pricing.
    -   **Price:** $5.00.
    -   **Currency:** USD.
    -   **Billing period:** Monthly.
6.  **Tax Code:** Select "Digital Goods" or "Software as a Service" (general).
7.  Click **Save product**.
8.  **Copy Price ID:** Look for the API ID starting with `price_...` (e.g., `price_1HK...`). *You will need this ID for the code.*

### 2.3 Tax Settings
1.  Go to **Settings** -> **Tax**.
2.  **Enable Stripe Tax** if you want automatic tax calculation based on user location.
3.  Set your "Origin address" if required.
4.  *Note: The implementation assumes tax is added on top of the $5 base price.*

### 2.4 Customer Portal (Self-Serve Management)
1.  Go to **Settings** -> **Customer Portal**.
2.  **Enable** the portal.
3.  **Features:**
    -   Allow customers to cancel subscriptions: **Yes** (Reason for cancellation: Optional).
    -   Allow customers to pause subscriptions: **No** (Simpler to just cancel).
    -   Allow customers to update payment methods: **Yes**.
    -   Allow customers to update billing information: **Yes**.
    -   Allow customers to switch plans: **No** (Since we only have one plan for now).
4.  **Save changes.**
5.  *We will link to this portal from the User Settings page.*

### 2.5 Webhooks (The Glue)
1.  Go to **Developers** -> **Webhooks**.
2.  Click **Add endpoint**.
3.  **Endpoint URL:** `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
    -   *Note: For local development, we will use the Supabase CLI to forward webhooks.*
4.  **Select events to listen to:**
    -   `checkout.session.completed` (New subscription started)
    -   `invoice.payment_succeeded` (Monthly renewal successful)
    -   `invoice.payment_failed` (Monthly renewal failed)
    -   `customer.subscription.deleted` (Subscription cancelled)
    -   `customer.subscription.updated` (Plan changes)
5.  Click **Add endpoint**.
6.  **Copy Signing Secret:** (`whsec_...`). *You will need this for the Supabase Edge Function secret.*

---

## 3. Database Strategy

We need to track subscription status, daily usage, and promo codes.

### 3.1 New Tables & Updates

#### `subscriptions` (New Table)
Syncs Stripe status to our DB for fast access.
```sql
create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status subscription_status not null,
  price_id text,
  quantity integer,
  cancel_at_period_end boolean,
  created_at timestamptz default now(),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  ended_at timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz
);
alter table public.subscriptions enable row level security;
create policy "Users can view own subscription" on public.subscriptions for select using (user_id = auth.uid());
```

#### `promo_codes` (New Table)
Manages the "CIT" codes and custom overrides.
```sql
create type promo_type as enum ('extended_trial', 'extra_limit', 'discount', 'free_month');

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type promo_type not null,
  config jsonb not null default '{}'::jsonb, -- e.g. { "days": 30, "limit": 15, "percent_off": 100 }
  max_redemptions integer,
  redemptions_count integer default 0,
  expires_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
alter table public.promo_codes enable row level security;
-- Only admins can read/write promo codes via service role function
```

#### `user_promos` (New Table)
Tracks which user used which code.
```sql
create table public.user_promos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  promo_code_id uuid references public.promo_codes(id) not null,
  applied_at timestamptz default now(),
  unique(user_id, promo_code_id)
);
alter table public.user_promos enable row level security;
create policy "Users can view own promos" on public.user_promos for select using (user_id = auth.uid());
```

#### `user_settings` (Update)
Add fields for caching effective limits in existing `user_settings` table.
```sql
alter table public.user_settings 
add column if not exists subscription_tier text default 'free' check (subscription_tier in ('free', 'pro', 'legacy_free')),
add column if not exists daily_limit_override integer,
add column if not exists trial_ends_at timestamptz,
add column if not exists grace_period_ends_at timestamptz;
```

### 3.2 Usage Tracking
We will maintain the `ai_requests` table for logs, but add a specialized counter in `rate_limits` for performance.
- **Redundancy:** We increment `rate_limits` counter on every request.
- **Reset:** A scheduled function or lazy-check triggers reset at 00:00 UTC. The schema for `rate_limits` already exists from previous migration but needs verification.

---

## 4. Backend Implementation (Supabase Edge Functions)

### 4.1 `functions/stripe-webhook`
Handles real-time updates from Stripe.
- **Security:** Verifies Stripe signature using `STRIPE_WEBHOOK_SECRET`.
- **Dependencies:** `stripe`, `@supabase/supabase-js`.
- **Logic:**
    - `checkout.session.completed`:
        - Retrieve `customer_id` and `subscription_id` from event.
        - Upsert into `subscriptions` table.
        - Update `user_settings.subscription_tier` to 'pro'.
        - Reset daily usage count (User gets fresh 50 requests).
    - `invoice.payment_succeeded`:
        - Update `current_period_end` in `subscriptions`.
    - `invoice.payment_failed`:
        - Update `subscriptions.status` to 'past_due'.
        - Downgrade `user_settings.subscription_tier` to 'free' (User requested immediate downgrade).
        - Trigger email notification (via Resend/SMTP if available, or just log for now).
    - `customer.subscription.deleted`:
        - Update `subscriptions.status` to 'canceled'.
        - Downgrade `user_settings.subscription_tier` to 'free'.

**Code Snippet (Webhook Skeleton):**
```typescript
serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return new Response("No signature", { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle event.type switch case...
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
```

### 4.2 `functions/create-checkout` (New)
Creates a Stripe Checkout Session for the user to pay.
- Input: `priceID`, `successURL`, `cancelURL`, `promoCode` (optional).
- Logic:
    - Get or create Stripe Customer for the authenticated user (check `subscriptions` table first).
    - Create Session with `mode='subscription'`.
    - Include `metadata: { user_id }`.
    - Apply discounts if `promoCode` is valid and type='discount'.
    - Return `url` for frontend redirect.

### 4.3 `functions/create-portal` (New)
Creates a link to the Billing Portal.
- Logic:
    - Get Stripe Customer ID from `subscriptions` table.
    - Create Portal Session.
    - Return `url`.

### 4.4 `functions/ai` (Update)
Crucial Gating Logic.
- **Step 1: Check Subscription & Permissions**
    - **Existing User Check:**
        - Is `now() < grace_period_ends_at`? -> Allow (Treat as Pro with 50 limit).
    - **Active Subscription:**
        - `subscription_tier` = 'pro' -> Limit = 50.
    - **Trial Check:**
        - `now() < trial_ends_at`? -> Grants **Trial Access** (Limit 5).
        - **CRITICAL:** If trial expired and no active subscription -> **Block request completely** (Limit 0).
    - **Promo Override:**
        - Check `daily_limit_override`. If exists, use MAX(standard_limit, override).
    - **Refill Interface:**
        - If upgraded today, ensure `rate_limits` reflects full allowance.

- **Step 2: Check Daily Usage**
    - Get current count from `rate_limits` for current UTC day.
    - If `count >= effective_limit`: Throw `402 Payment Required` error with `code: 'limit_reached'`.

- **Step 3: Check Model Access**
    - **Pro Models:** `gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro`, `o1`.
    - If `subscription_tier` != 'pro' AND model is in Pro List:
        - Throw `403 Forbidden` error with `code: 'upgrade_required'`.

**Code Snippet (Gating Logic Helper):**
```typescript
async function getEffectiveLimits(userId: string) {
  // 1. Check existing user grace period
  const { data: user } = await supabase.from('user_settings').select('*').eq('user_id', userId).single();
  
  if (user.subscription_tier === 'pro' || user.subscription_tier === 'legacy_free') {
    return { limit: user.daily_limit_override || 50, models: 'all' };
  }
  
  if (user.trial_ends_at && new Date() < new Date(user.trial_ends_at)) {
     return { limit: user.daily_limit_override || 5, models: 'standard' }; // Trial is limited to Standard models + 5 reqs
  }

  // Trial Expired (Block)
  return { limit: user.daily_limit_override || 0, models: 'none' };
}
```

### 4.5 `functions/admin` (Update)
- Add endpoints to:
    - List active subscribers (join `subscriptions` + `user_settings`).
    - Create/Delete `promo_codes`.
    - Manually set `daily_limit_override` for a user.
    - View Stripe Customer ID for debugging.

---

## 5. Frontend Implementation (React)

### 5.1 Pricing & Upgrade UI
- **`PricingModal.tsx`**:
    - Beautiful, glassmorphism design using `shadcn/ui` Dialog.
    - Display "Free" (Current) vs "Pro" ($5/mo).
    - Features list (Advanced Models, 50 queries/day).
    - "Upgrade Now" button -> Calls `create-checkout` -> Redirects to Stripe.
    - "Have a Promo Code?" input -> Validates via DB -> Applies override or discount.

- **`LimitReachedModal.tsx`**:
    - Triggered when AI API returns `402`.
    - **Scenario A (Daily Limit):** "You've hit your daily limit of 5 requests." (For active Trial/Pro).
    - **Scenario B (Trial Expired):** "Your 3-day free trial has ended."
    - CTA: "Upgrade to Pro" or "Enter Promo Code".

- **`ModelRestrictedModal.tsx`**:
    - Triggered when AI API returns `403`.
    - "This model is reserved for Pro members."
    - CTA: "Upgrade to Unlock".

### 5.2 Settings Page Updates
- **Subscription Section**:
    - Show current status: `Free` / `Pro` / `Trial`.
    - Usage bar: `Used 3 / 5 requests today`.
    - If Pro: "Manage Subscription" button -> Calls `create-portal`.
    - If Free: "Upgrade to Pro" button.
- **Danger Zone**:
    - "Delete Account" -> Now also cancels Stripe subscription via API before deleting DB data.

### 5.3 Model Selector Updates
- In `SettingsStore` / `ModelSelector`:
    - Add `isProOnly` flag to model definitions.
    - New Models: `Claude 3.5 Sonnet`, `GPT-4o`, `Gemini 1.5 Pro`.
    - If user selects a Pro model:
        - Trigger `PricingModal` immediately.
        - Do not allow selection until upgraded.
    - Remove "Temperature" slider.

### 5.4 Homepage & Landing
- Add a "Pricing" section or link.
- Update hero copy to reflect "Freemium" nature if needed.
- Ensure "Get Started" explicitly mentions "Start Free Trial".

---

## 6. Promo Code System Details

We need a flexible parser in the backend.

**Supported Types:**
1.  **`extended_trial`**: Sets `trial_ends_at` to `now() + X days`. User stays "Free" but gets extended trial period.
2.  **`extra_limit`**: Permanently sets `daily_limit_override = X`.
3.  **`discount`**: Creates a Stripe Coupon and applies it to the checkout session metadata.
    -   *Logic:* We will pass `promotion_code` to the Checkout Session.
4.  **`free_month`**: Grant 1 month of Pro access without Card?
    -   *Impl:* Set `subscription_tier='pro'` and `grace_period_ends_at = now() + 30 days`.

**Admin UI:**
- Create form to generate codes:
    - Input: Code String ("CIT2026")
    - Select Type
    - Config JSON
    - Max Redemptions

---

## 7. Migration & Rollout Plan

**Phase 1: Database & Backend**
1.  Run Migration SQL (`migrations/20260208000000_stripe_schema.sql`).
2.  Deploy `stripe-webhook` function.
3.  Deploy updated `ai`, `admin`, `share` functions.
4.  Run a script to mark all existing users:
    -   Set `grace_period_ends_at = now() + interval '30 days'`.
    -   Set `subscription_tier = 'legacy_free'` (behaves like Pro).

**Phase 2: Frontend Integration**
1.  Install `@stripe/stripe-js`.
2.  Implement Modals (`Price`, `Limit`, `Model`).
3.  Connect "Upgrade" buttons.
4.  Test standard flow (Free -> Upgrade -> Pro).
5.  Test Promo Code flow.
6.  Remove temperature slider.

**Phase 3: Launch**
1.  Swap env vars to Live keys.
2.  Update Homepage.
3.  Monitor `stripe-webhook` logs closely.

---

## 8. Detailed Implementation Steps (Checklist)

### Step 1: Stripe Setup (Manual)
- [ ] Create Product & Price.
- [ ] Get Keys & Webhook Secret.
- [ ] Enable Customer Portal.
- [ ] Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` to Supabase secrets.
- [ ] Add `VITE_STRIPE_PRICE_ID` to frontend `.env`.

### Step 2: Database Schema
- [x] Create migration file `migrations/20260208000000_stripe_schema.sql`.
- [x] Copy schema definitions from Section 3.1.
- [x] Add RLS policies for `subscriptions` (read-own) and `promo_codes` (read-none, verify via func).
- [ ] Run migration on Supabase (not done — requires deploy).

### Step 3: Backend Functions
- [x] **`stripe-webhook`**:
    - [x] Import `Stripe` SDK.
    - [x] Verify signature.
    - [x] Handle `checkout.session.completed`.
    - [x] Handle `invoice.payment_succeeded`.
    - [x] Handle `invoice.payment_failed`.
    - [x] Handle `customer.subscription.deleted`.
    - [x] Handle `customer.subscription.updated`.
- [x] **`create-checkout`**:
    - [x] Create session with `mode: 'subscription'`, `line_items`, `success_url`, `cancel_url`.
    - [x] Handle promo code application.
- [x] **`create-portal`**:
    - [x] Create portal session with `return_url`.
- [x] **`redeem-promo`** (new):
    - [x] Validate and apply promo codes (extended_trial, extra_limit, free_month, discount).
- [x] **`ai` function**:
    - [x] Implement `getSubscriptionInfo(user_id)` helper.
    - [x] Implement updated `checkRateLimit(user_id, model)` with subscription gating.
    - [x] Implement model access checking (`PRO_MODELS` set).
    - [x] Return 402 for limit_reached/trial_expired, 403 for upgrade_required.
- [x] **`admin` function**:
    - [x] Add `promo-codes`, `create-promo`, `toggle-promo`, `subscribers` endpoints.
- [ ] Deploy all functions to Supabase (not done — requires deploy).

### Step 4: Frontend Components
- [x] **Dependencies**: `npm install @stripe/stripe-js`.
- [x] **Hook**: Created `src/hooks/use-subscription.ts` with tier, usage, limits.
- [x] **Hook**: Created `src/hooks/use-subscription-error.ts` for modal error handling.
- [x] **Stripe Lib**: Created `src/lib/stripe.ts` (redirectToCheckout, redirectToPortal, redeemPromoCode).
- [x] **Types**: Updated `AIModel` with `isProOnly` flag, marked Pro models in `DEFAULT_PROVIDERS`.
- [x] **AI Client**: Added `AISubscriptionError`, `AIModelRestrictionError` error classes + type guards.
- [x] **Modals**:
    - [x] `PricingModal.tsx`: Free vs Pro comparison, upgrade button, promo code input.
    - [x] `LimitReachedModal.tsx`: Daily limit / trial expired enforcement.
    - [x] `ModelRestrictedModal.tsx`: Pro model gating.
- [x] **Pages**:
    - [x] `SettingsPage.tsx`: Added subscription card with usage bar, manage/upgrade buttons.
    - [x] All 5 feature pages: Integrated subscription error modals (Generate, Attack, Brainstorm, Factoids, Ask).
    - [ ] `LandingPage.tsx`: Add Pricing section (not done — low priority).

### Step 5: Admin Panel
- [x] Add "Promo Codes" tab to `AdminPage.tsx` with create/toggle UI.
- [x] Add "Subscribers" view to `AdminPage.tsx`.
- [ ] Test code generation and redemption (requires running migration + deploy).

### Step 6: Quality
- [x] ESLint: 0 errors (3 warnings in coverage files only).
- [x] Build: Succeeds in 4s.
- [x] Tests: 229/229 passing.

## 9. Appendix: Edge Function Helper Details

### `checkRateLimit` Logic Detail
```typescript
async function checkRateLimit(userId: string) {
  // 1. Get Effective Limit
  const { data: user } = await supabase.from('user_settings').select('subscription_tier, daily_limit_override, trial_ends_at').eq('user_id', userId).single();
  let limit = 5; // Default free
  
  if (user.subscription_tier === 'pro') limit = 50;
  if (user.daily_limit_override) limit = Math.max(limit, user.daily_limit_override);
  
  // 2. Count today's requests
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('ai_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', today);

  if (count >= limit) {
    throw new Error('Rate limit exceeded');
  }
}
```

### `stripe-webhook` Dependencies
You will need to update `supabase/functions/import_map.json` to include:
```json
{
  "imports": {
    "stripe": "https://esm.sh/stripe@14.10.0?target=deno"
  }
}
```

### Frontend `useSubscription` Hook
Created `src/hooks/use-subscription.ts`:
```typescript
export function useSubscription() {
  const { user } = useAuth();
  const [tier, setTier] = useState('free');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      // Fetch from user_settings table via Supabase client
      const { data } = await supabase.from('user_settings').select('subscription_tier').eq('user_id', user.id).single();
      setTier(data?.subscription_tier || 'free');
      setLoading(false);
    }
    if (user) load();
  }, [user]);
  
  return { tier, isPro: tier === 'pro', loading };
}
```

## Merging Prompt

Use this prompt when merging the Stripe monetization branch into main after route and Ask-search changes:

```text
You are a senior full-stack engineer performing a production merge of Stripe monetization into an app that recently changed routing and Ask behavior.

Context:
- Target branch: main
- Source branch: feature/stripe-monetization
- Main already includes:
  1) /app is now the authenticated mode-selector homepage
  2) Generate moved to /app/generate
  3) Ask supports optional web-search toggles and extended ask payload

Your job:
1. Merge feature/stripe-monetization into main and resolve all conflicts safely.
2. Keep BOTH sets of functionality:
   - Stripe monetization (pricing modals, usage gating, pro model restrictions, checkout/portal flows, webhook schema)
   - New routing and Ask web-search behavior from main
3. Carefully reconcile overlap in these files (especially):
   - src/components/features/ask/AskChat.tsx
   - src/pages/AskPage.tsx
   - src/lib/ai/client.ts
   - src/lib/stores/settings-store.ts
   - supabase/functions/ai/index.ts
   - src/App.tsx and route-dependent navigation files
4. Enforce routing contract:
   - /app = home mode selector
   - /app/generate = generate page
   - Update any stale /app assumptions used for generate navigation, onboarding, redirects, and history loads
5. Ensure onboarding still targets generate-specific selectors and does not break from the route move.
6. Verify auth/login redirects remain within app routes and do not bounce users to landing unexpectedly.
7. Validate Stripe flows still function after merge:
   - upgrade/open pricing modal
   - model restriction modal
   - limit reached modal
   - checkout session creation and portal links
   - server/client error handling paths
8. Verify backend compatibility:
   - Supabase edge function contracts match frontend payloads
   - no regression in ask/factoids/generate branches
   - schema/migration assumptions remain correct
9. Run full validation:
   - npm run lint
   - npm test
   - npm run build
10. Provide final report:
   - conflict resolutions made
   - any behavior changes
   - tests/build outcomes
   - residual risks

Constraints:
- Do not remove monetization logic.
- Do not revert route migration (/app home and /app/generate generate).
- Do not push automatically.
- Prefer minimal, explicit conflict fixes over broad rewrites.
```
