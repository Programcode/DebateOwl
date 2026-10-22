# Model defaults and the model selector

Every AI tool has a model selector. Basic accounts can pick Claude Haiku 5.5, GPT-6 Luna, or Muse Spark 1.3 (`meta/muse-spark-1.3-contributor`); everything else is Pro. A new Pro account starts every tool on Claude Sonnet 5.5, and a Basic (trial) account on Claude Haiku 5.5. Claude Opus 5.5 is opt-in only: it runs when someone picks it, and Auto Pro never routes or falls back to it. Pro-only models show a `Pro` badge and are disabled for Basic accounts. A setting saved with a retired catalog ID is rewritten on the next load: GPT-5.6 Luna moves to Claude Haiku 5.5, Claude Sonnet 5 to Claude Sonnet 5.5, Claude Opus 5 to Claude Opus 5.5, GPT-5.6 Sol and Terra to GPT-6.1 Sol, DeepSeek V4 Flash to Claude Haiku 5.5, and Muse Spark 1.3 to its contributor tier. The Edge Functions resolve a retired ID from an older client the same way. A retired Basic ID never resolves to a Pro model. The catalog and defaults live in `supabase/functions/_shared/model-catalog.ts`.

## Sub-features

- `model-pro-default`: a new Pro account's `user_settings.feature_configs` hold `anthropic/claude-sonnet-5.5` for every tool, the selector shows `Claude Sonnet 5.5` with `Claude Opus 5.5` still enabled, and a Generate run records `model: anthropic/claude-sonnet-5.5` in `ai_requests`.
- `model-basic-default`: a trial account with no saved settings gets `anthropic/claude-haiku-5.5` everywhere. `Claude Opus 5.5` and `Claude Sonnet 5.5` are disabled options, and a Generate run records Haiku 5.5.
- `model-retired`: saved `anthropic/claude-sonnet-5` configs become `anthropic/claude-sonnet-5.5` on screen and in `user_settings`.

## How to get to it (user POV)

- Any tool page, for example `/app/generate`: the combobox named `Select AI model for generate` sits beside the tool's inputs.

## Driving it with verify.sh + Playwright

- `bin/verify.sh drive recipes/model-defaults` covers all three sub-features.
- Demo sign-in grants Pro. For the Basic path the recipe sets `subscription_tier: "trial"`, a future `trial_ends_at`, clears `grace_period_ends_at` and `daily_limit_override`, and empties `feature_configs`, then reloads so the client re-hydrates as a new trial account.
- End states are read from `user_settings.feature_configs` and `ai_requests.model` through `admin`, and from the fake provider's recorded `model`.

## Gotchas

- Fake mode records the requested model but answers with fake text, and live mode rewrites every chat call to the Muse Spark contributor pin. Neither proves that OpenRouter accepts the Claude 5.5 IDs; that needs a direct OpenRouter call.
- Existing saved choices of a model still in the catalog are kept. Only retired IDs and unsaved settings move to the new defaults, so a Pro account that saved Opus 5.5 under the old default keeps it.
