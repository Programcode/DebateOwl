-- Account export keeps the user's content and account facts. Stripe customer
-- ids, gifted-trial markers, daily limit overrides, and upstream cost fields
-- stay in the database and are left out of the document.

CREATE OR REPLACE FUNCTION public.export_account_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Credentials, server-side integrity values, and internal billing or cost fields
  -- are not the user's content to carry away.
  v_redacted constant text[] := ARRAY[
    'key_ciphertext', 'claim_token', 'request_fingerprint',
    'stripe_customer_id', 'customer_id', 'daily_limit_override',
    'gifted_trial_2026_05', 'gifted_trial_gratuity_2026_05',
    'pricing_snapshot_id', 'raw_usage'
  ];
  -- Admin catalog work rather than the user's personal data, and admin grants,
  -- which RLS hides from the user and which are exported below without notes.
  v_skipped constant text[] := ARRAY['admin_grants', 'curated_sources', 'demo_access_codes', 'global_prompts', 'promo_codes'];
  v_ownership constant name[] := ARRAY['user_id', 'owner_id', 'author_id', 'created_by', 'recipient_id']::name[];
  v_account jsonb;
  v_data jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_table record;
BEGIN
  SELECT jsonb_build_object(
    'id', account.id,
    'email', account.email,
    'phone', account.phone,
    'created_at', account.created_at,
    'last_sign_in_at', account.last_sign_in_at,
    'user_metadata', account.raw_user_meta_data
  )
  INTO v_account
  FROM auth.users AS account
  WHERE account.id = p_user_id;

  IF v_account IS NULL THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_table IN
    SELECT
      owner.oid::regclass AS relation,
      owner.relname AS name,
      string_agg(format('%I = $1', reference.attname), ' OR ' ORDER BY reference.attname) AS predicate,
      -- Workspace rows are shared work. Like their read policies, export them
      -- only while the user is still a member of that workspace.
      CASE
        WHEN owner.relname = 'workspaces' THEN 'id'
        WHEN EXISTS (
          SELECT 1 FROM pg_attribute AS scope
          WHERE scope.attrelid = owner.oid AND scope.attname = 'workspace_id' AND NOT scope.attisdropped
        ) THEN 'workspace_id'
      END AS workspace_column
    FROM pg_constraint AS fk
    JOIN pg_class AS owner ON owner.oid = fk.conrelid
    JOIN pg_namespace AS schema ON schema.oid = owner.relnamespace
    JOIN pg_attribute AS reference ON reference.attrelid = fk.conrelid AND reference.attnum = fk.conkey[1]
    WHERE fk.contype = 'f'
      AND fk.confrelid = 'auth.users'::regclass
      AND cardinality(fk.conkey) = 1
      AND schema.nspname = 'public'
      AND NOT owner.relname = ANY (v_skipped)
      AND reference.attname = ANY (v_ownership)
    GROUP BY owner.oid, owner.relname
    ORDER BY owner.relname
  LOOP
    EXECUTE format(
      'SELECT jsonb_agg(to_jsonb(owned) - $2) FROM %s AS owned WHERE (%s)%s',
      v_table.relation,
      v_table.predicate,
      CASE WHEN v_table.workspace_column IS NULL THEN '' ELSE format(
        ' AND EXISTS (SELECT 1 FROM public.workspace_members AS member WHERE member.workspace_id = owned.%I AND member.user_id = $1)',
        v_table.workspace_column
      ) END
    )
    INTO v_rows
    USING p_user_id, v_redacted;

    IF v_rows IS NOT NULL THEN
      v_data := v_data || jsonb_build_object(v_table.name, v_rows);
    END IF;
  END LOOP;

  -- Access the user was granted, without the admin's identity or notes.
  SELECT jsonb_agg(jsonb_build_object(
    'grant_type', grant_row.grant_type,
    'starts_at', grant_row.starts_at,
    'ends_at', grant_row.ends_at,
    'created_at', grant_row.created_at
  ))
  INTO v_rows
  FROM public.admin_grants AS grant_row
  WHERE grant_row.target_user_id = p_user_id;
  IF v_rows IS NOT NULL THEN
    v_data := v_data || jsonb_build_object('access_grants', v_rows);
  END IF;

  -- Chat messages belong to the user through their chat.
  SELECT jsonb_agg(to_jsonb(message))
  INTO v_rows
  FROM public.messages AS message
  JOIN public.chats AS chat ON chat.id = message.chat_id
  WHERE chat.user_id = p_user_id;
  IF v_rows IS NOT NULL THEN
    v_data := v_data || jsonb_build_object('messages', v_rows);
  END IF;

  -- Announcements the user wrote as an admin.
  SELECT jsonb_agg(to_jsonb(announcement))
  INTO v_rows
  FROM public.admin_announcements AS announcement
  WHERE announcement.created_by = p_user_id;
  IF v_rows IS NOT NULL THEN
    v_data := v_data || jsonb_build_object('admin_announcements', v_rows);
  END IF;

  -- Announcements published to the user, without the other recipients. Like
  -- the read policy, this hides scheduled and withdrawn ones.
  SELECT jsonb_agg(to_jsonb(announcement) - 'target_user_ids'::text - 'created_by'::text)
  INTO v_rows
  FROM public.admin_announcements AS announcement
  WHERE p_user_id = ANY (announcement.target_user_ids)
    AND announcement.starts_at <= now()
    AND announcement.deactivated_at IS NULL;
  IF v_rows IS NOT NULL THEN
    v_data := v_data || jsonb_build_object('announcements_received', v_rows);
  END IF;

  RETURN jsonb_build_object(
    'format', 'debatelab-account-export',
    'version', 1,
    'exported_at', now(),
    'account', v_account,
    'data', v_data
  );
END;
$$;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;
