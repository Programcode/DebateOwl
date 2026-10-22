-- Repair ai_requests rows that logged a BYOK model call as $0.
--
-- With a provider key attached (BYOK), OpenRouter's usage.cost is only its
-- own fee, usually 0, and the provider bills our key for
-- usage.cost_details.upstream_inference_cost. Calculator v1
-- (openrouter-usage-v1) stored the fee alone, so every Anthropic call logged
-- $0. v2 adds the upstream charge; this recomputes the old rows the same way
-- from the raw usage each row kept.
--
-- Only v1 rows that were priced and contain a BYOK call change. A row is
-- left alone unless every call in it has a usable cost (and, for BYOK calls,
-- a usable upstream charge). Repaired rows get their own calculation version,
-- so the update cannot apply twice and stays auditable. raw_usage is not
-- touched.
--
-- Deploy order: deploy the new ai and ai-stream functions (each bundles its
-- own copy of _shared/cost.ts) before applying this migration. It runs once,
-- so v1 rows that the old functions write after it has run stay at $0.

with leaves as (
  -- One row per provider call. raw_usage is either a single OpenRouter usage
  -- object or {calls: [...]} for a merged request, and a repair retry can
  -- nest one more {calls: [...]} level. Anything deeper has no top-level
  -- cost and keeps its row out of the update.
  select r.id, leaf.c
  from public.ai_requests r
  cross join lateral (
    select e
    from jsonb_array_elements(
      case when jsonb_typeof(r.raw_usage -> 'calls') = 'array'
        then r.raw_usage -> 'calls' else jsonb_build_array(r.raw_usage) end
    ) as top(e)
    where jsonb_typeof(e -> 'calls') is distinct from 'array'
    union all
    select n
    from jsonb_array_elements(
      case when jsonb_typeof(r.raw_usage -> 'calls') = 'array'
        then r.raw_usage -> 'calls' else jsonb_build_array(r.raw_usage) end
    ) as top(e)
    cross join lateral jsonb_array_elements(e -> 'calls') as nested(n)
    where jsonb_typeof(e -> 'calls') = 'array'
  ) as leaf(c)
  where r.cost_calculation_version = 'openrouter-usage-v1'
    and r.cost_usd is not null
    and jsonb_typeof(r.raw_usage) = 'object'
),
checked as (
  -- Validity is decided on jsonb values, without casts, so a malformed row is
  -- skipped instead of failing the migration.
  select
    id,
    c,
    coalesce(c -> 'is_byok' = 'true'::jsonb, false) as byok,
    coalesce(
      jsonb_typeof(c -> 'cost') = 'number'
      and c -> 'cost' >= '0'::jsonb
      and (
        c -> 'is_byok' is distinct from 'true'::jsonb
        or (
          jsonb_typeof(c -> 'cost_details' -> 'upstream_inference_cost') = 'number'
          and c -> 'cost_details' -> 'upstream_inference_cost' >= '0'::jsonb
        )
      ),
      false
    ) as ok
  from leaves
),
recomputed as (
  select
    id,
    sum(
      case
        when not ok then null
        when byok then (c ->> 'cost')::numeric + (c -> 'cost_details' ->> 'upstream_inference_cost')::numeric
        else (c ->> 'cost')::numeric
      end
    ) as cost,
    bool_and(ok) as complete,
    bool_or(byok) as has_byok
  from checked
  group by id
)
update public.ai_requests as a
set
  cost_usd = recomputed.cost,
  cost_calculation_version = 'openrouter-usage-v1-byok-backfill'
from recomputed
where a.id = recomputed.id
  and recomputed.complete
  and recomputed.has_byok;
