-- Rolls back supabase/migrations/20261022120000_opus_default_to_sonnet.sql.
-- Not a migration: `supabase db push` never reads this directory. To apply it,
-- copy it into supabase/migrations under a new timestamp (a forward corrective
-- migration) and ship that like any other migration.
--
-- A tool setting goes back to Opus 5.5 only where the migration moved it from
-- Opus to Sonnet and it still holds Sonnet. Anything the user changed after the
-- migration stays. Restored users leave the backup table, so a second run does
-- nothing. The backup table itself stays; dropping it is a separate decision.

WITH restored AS (
  SELECT
    settings.user_id,
    (
      SELECT jsonb_object_agg(
        entry.key,
        CASE
          WHEN jsonb_typeof(entry.value) = 'object'
            AND entry.value->>'model' = 'anthropic/claude-sonnet-5.5'
            AND backup.feature_configs->entry.key->>'model' = 'anthropic/claude-opus-5.5'
            AND backup.migrated_feature_configs->entry.key->>'model' = 'anthropic/claude-sonnet-5.5'
          THEN jsonb_set(entry.value, '{model}', '"anthropic/claude-opus-5.5"')
          ELSE entry.value
        END
      )
      FROM jsonb_each(settings.feature_configs) AS entry
    ) AS configs
  FROM public.user_settings AS settings
  JOIN private.opus_default_backup AS backup USING (user_id)
  WHERE jsonb_typeof(settings.feature_configs) = 'object'
    AND settings.feature_configs <> '{}'::jsonb
  FOR UPDATE OF settings
),
updated AS (
  UPDATE public.user_settings AS settings
  SET feature_configs = restored.configs, updated_at = now()
  FROM restored
  WHERE settings.user_id = restored.user_id
    AND settings.feature_configs IS DISTINCT FROM restored.configs
  RETURNING settings.user_id
)
DELETE FROM private.opus_default_backup;
