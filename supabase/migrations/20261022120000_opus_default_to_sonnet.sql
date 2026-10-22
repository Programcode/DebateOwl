-- Claude Opus 5.5 was the Pro default until Sonnet 5.5 replaced it. A saved
-- setting cannot tell a default from a deliberate pick, so every saved Opus 5.5
-- tool setting moves to Sonnet 5.5. Opus stays selectable. Pro access depends
-- on the clock and on Stripe rows, so this covers every account with Opus
-- saved: Basic clients already map Pro-only models to Claude Haiku 5.5.
--
-- The original settings go to a backup table first. A user with a backup row
-- is never migrated twice, so running this again cannot undo an Opus pick made
-- after the first run. supabase/rollbacks/20261022120000_opus_default_to_sonnet.down.sql
-- restores the backup.

CREATE TABLE IF NOT EXISTS private.opus_default_backup (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_configs jsonb NOT NULL,
  migrated_feature_configs jsonb NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.opus_default_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.opus_default_backup FROM PUBLIC, anon, authenticated;

WITH targets AS (
  SELECT
    settings.user_id,
    settings.feature_configs AS original,
    (
      SELECT jsonb_object_agg(
        entry.key,
        CASE
          WHEN jsonb_typeof(entry.value) = 'object'
            AND entry.value->>'model' = 'anthropic/claude-opus-5.5'
          THEN jsonb_set(entry.value, '{model}', '"anthropic/claude-sonnet-5.5"')
          ELSE entry.value
        END
      )
      FROM jsonb_each(settings.feature_configs) AS entry
    ) AS migrated
  FROM public.user_settings AS settings
  WHERE jsonb_typeof(settings.feature_configs) = 'object'
    AND EXISTS (
      SELECT 1 FROM jsonb_each(settings.feature_configs) AS entry
      WHERE jsonb_typeof(entry.value) = 'object'
        AND entry.value->>'model' = 'anthropic/claude-opus-5.5'
    )
    AND NOT EXISTS (
      SELECT 1 FROM private.opus_default_backup AS backup
      WHERE backup.user_id = settings.user_id
    )
  FOR UPDATE OF settings
),
backed_up AS (
  INSERT INTO private.opus_default_backup (user_id, feature_configs, migrated_feature_configs)
  SELECT user_id, original, migrated FROM targets
  RETURNING user_id
)
UPDATE public.user_settings AS settings
SET feature_configs = targets.migrated, updated_at = now()
FROM targets
JOIN backed_up USING (user_id)
WHERE settings.user_id = targets.user_id;
