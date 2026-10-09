# Model defaults and the model selector

Every AI tool has a model selector. A new Pro account starts every tool on Claude Opus 5.5, and a Basic (trial) account on Claude Haiku 5.5. Pro-only models show a `Pro` badge and are disabled for Basic accounts. A setting saved with a retired catalog ID (Claude Sonnet 5 or Claude Opus 5) is rewritten to Claude Opus 5.5 on the next load, and the Edge Functions accept the retired ID from an older client and route it to Opus 5.5. The catalog and defaults live in `supabase/functions/_shared/model-catalog.ts`.

## Sub-features

- `model-pro-default`: a new Pro account's `user_settings.feature_configs` hold `anthropic/claude-opus-5.5` for every tool, the selector shows `Claude Opus 5.5`, and a Generate run records `model: anthropic/claude-opus-5.5` in `ai_requests`.
- `model-basic-default`: a trial account with no saved settings gets `anthropic/claude-haiku-5.5` everywhere. `Claude Opus 5.5` and `Claude Sonnet 5.5` are disabled options, and a Generate run records Haiku 5.5.
- `model-retired`: saved `anthropic/claude-sonnet-5` configs become `anthropic/claude-opus-5.5` on screen and in `user_settings`.

## How to get to it (user POV)

- Any tool page, for example `/app/generate`: the combobox named `Select AI model for generate` sits beside the tool's inputs.

## Driving it with verify.sh + Playwright

- `bin/verify.sh drive recipes/model-defaults` covers all three sub-features.
- Demo sign-in grants Pro. For the Basic path the recipe sets `subscription_tier: "trial"`, a future `trial_ends_at`, clears `grace_period_ends_at` and `daily_limit_override`, and empties `feature_configs`, then reloads so the client re-hydrates as a new trial account.
- End states are read from `user_settings.feature_configs` and `ai_requests.model` through `admin`, and from the fake provider's recorded `model`.

## Gotchas

- Fake mode records the requested model but answers with fake text, and live mode rewrites every chat call to the Muse Spark contributor pin. Neither proves that OpenRouter accepts the Claude 5.5 IDs; that needs a direct OpenRouter call.
- Existing saved choices of a model still in the catalog are kept. Only retired IDs and unsaved settings move to the new defaults.
