# Rate-Limit UI Cleanup Plan

## Goal

Remove or hide remaining user-facing rate-limit wording if the product direction is to avoid showing limits prominently, while preserving backend protection and admin observability.

## Implementation Steps

1. Search locales and UI for:
   - rate limit
   - daily limit
   - requests/day
   - limit reached
2. Decide which messages stay:
   - backend error when a request is blocked should remain understandable.
   - marketing/settings copy can be softened or removed.
3. Update English, Spanish, and Hungarian locale strings together.
4. Keep admin-only usage/limit fields visible if useful.
5. Add tests for subscription error UI after copy changes.

## Tests

- `npm run lint`
- `npm test -- --run src/test/i18n.test.ts src/test/hooks/use-subscription-error.test.ts`
- Browser check Settings and Pricing.

## Deployment

Frontend-only deploy unless backend error text changes.
