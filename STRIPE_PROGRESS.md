# Stripe Implementation Progress

**Last Updated:** 2026-02-10
**Status:** Code complete, not deployed

## What's Done (All code written, lint/test passing)

### Database
- `supabase/migrations/20260208000000_stripe_schema.sql` — Creates `subscriptions`, `promo_codes`, `user_promos` tables, adds `subscription_tier`/`daily_limit_override`/`trial_ends_at`/`grace_period_ends_at` columns to `user_settings`, sets up RLS policies, and migrates existing users to `legacy_free` with 30-day grace period.

### Backend (Supabase Edge Functions)
| Function | Path | Status |
|---|---|---|
| `stripe-webhook` | `supabase/functions/stripe-webhook/index.ts` | New — handles checkout.session.completed, invoice.payment_succeeded/failed, subscription deleted/updated |
| `create-checkout` | `supabase/functions/create-checkout/index.ts` | New — creates Stripe Checkout Sessions with promo code support |
| `create-portal` | `supabase/functions/create-portal/index.ts` | New — creates Stripe Customer Portal sessions |
| `redeem-promo` | `supabase/functions/redeem-promo/index.ts` | New — validates and applies promo codes (extended_trial, extra_limit, free_month, discount) |
| `ai` | `supabase/functions/ai/index.ts` | Updated — added `getSubscriptionInfo()`, `PRO_MODELS` set, subscription-aware `checkRateLimit()` that returns 402/403 |
| `admin` | `supabase/functions/admin/index.ts` | Updated — added `promo-codes`, `create-promo`, `toggle-promo`, `subscribers` endpoints |

### Frontend
| File | Status | Description |
|---|---|---|
| `src/hooks/use-subscription.ts` | New | Hook providing tier, isPro, dailyLimit, dailyUsed, trialEndsAt, refresh() |
| `src/hooks/use-subscription-error.ts` | New | Hook that detects 402/403 errors and opens correct modal |
| `src/lib/stripe.ts` | New | `redirectToCheckout()`, `redirectToPortal()`, `redeemPromoCode()` helpers |
| `src/lib/ai/client.ts` | Updated | Added `AISubscriptionError`, `AIModelRestrictionError`, type guards, error parsing |
| `src/lib/ai/providers/types.ts` | Updated | Added `isProOnly` flag to `AIModel`, marked pro models |
| `src/components/features/subscription/PricingModal.tsx` | New | Free vs Pro comparison, Stripe checkout redirect, promo code input |
| `src/components/features/subscription/LimitReachedModal.tsx` | New | Daily limit / trial expired modal with upgrade CTA |
| `src/components/features/subscription/ModelRestrictedModal.tsx` | New | Pro model restriction modal |
| `src/pages/SettingsPage.tsx` | Updated | Added subscription status card, usage bar, manage/upgrade buttons, model gating |
| `src/pages/GeneratePage.tsx` | Updated | Integrated subscription error modals |
| `src/pages/AttackPage.tsx` | Updated | Integrated subscription error modals |
| `src/pages/BrainstormPage.tsx` | Updated | Integrated subscription error modals |
| `src/pages/FactoidsPage.tsx` | Updated | Integrated subscription error modals |
| `src/pages/AskPage.tsx` | Updated | Integrated subscription error modals |
| `src/pages/AdminPage.tsx` | Updated | Added Promo Codes tab (create/toggle) + Subscribers tab |
| `package.json` | Updated | Added `@stripe/stripe-js` dependency |

## What's NOT Done (Requires Manual Steps / Deploy)

### 1. Stripe Dashboard Setup (Manual — see stripe_implementation.md Section 2)
- Create DebateLab Pro product ($5/mo) in Stripe Dashboard
- Copy the Price ID (starts with `price_...`)
- Enable Customer Portal
- Add webhook endpoint pointing to `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Copy webhook signing secret

### 2. Environment Variables
- Add to Supabase secrets:
  - `STRIPE_SECRET_KEY` — from Stripe Dashboard
  - `STRIPE_WEBHOOK_SECRET` — from webhook endpoint
- Add to frontend `.env`:
  - `VITE_STRIPE_PRICE_ID` — the Price ID from step 1

### 3. Deploy
- Run the migration SQL against Supabase DB
- Deploy all 6 edge functions: `ai`, `admin`, `stripe-webhook`, `create-checkout`, `create-portal`, `redeem-promo`
- Deploy frontend (build already succeeds)

### 4. Landing Page Pricing Section
- `LandingPage.tsx` doesn't have a pricing section yet (low priority, users can see pricing in the PricingModal from Settings)

### 5. Stripe Tax Configuration
- Enable Stripe Tax in Dashboard settings if desired
- `create-checkout` already has `automatic_tax: { enabled: true }` set

## Architecture Notes

### Subscription Tiers
| Tier | Daily Limit | Pro Models | When |
|---|---|---|---|
| `trial` | 5 | No | New users, first 3 days |
| `pro` | 50 | Yes | Active Stripe subscription |
| `legacy_free` | 50 | Yes | Existing users during 30-day grace |
| `expired` | 0 | No | Trial/grace expired, no subscription |

### Error Codes from AI Function
| HTTP | Code | Meaning | Frontend Action |
|---|---|---|---|
| 402 | `trial_expired` | Trial ended, no sub | Shows LimitReachedModal (trial_expired) |
| 402 | `limit_reached` | Daily requests used up | Shows LimitReachedModal (limit_reached) |
| 403 | `upgrade_required` | Pro model selected by free user | Shows ModelRestrictedModal |

### Pro Models (Gated on Backend)
`gpt-4o`, `claude-3-5-sonnet-latest`, `claude-3-opus-20240229`, `gemini-1.5-pro`, `gemini-2.0-pro-exp`, `gemini-3-pro-preview`

### Promo Code Types
| Type | Effect |
|---|---|
| `extended_trial` | Sets `trial_ends_at` to now + X days |
| `extra_limit` | Sets `daily_limit_override` to X |
| `free_month` | Sets tier to `pro` + grace period 30 days |
| `discount` | Applied at Stripe checkout (not redeemed server-side) |
