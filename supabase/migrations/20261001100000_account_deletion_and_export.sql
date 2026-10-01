-- Account deletion and data export for the `account` Edge Function.
--
-- The function deletes the auth user through the Auth admin API. Foreign keys
-- into auth.users cascade or set null, with two deliberate exceptions:
--   * Workspace ownership and authorship are RESTRICT, so a raw delete cannot
--     silently remove shared work. prepare_account_deletion clears them first.
--   * admin_announcements has no foreign key; a trigger clears it on any delete.

-- Admin-authored catalog rows outlive the admin's account.
ALTER TABLE public.promo_codes
  DROP CONSTRAINT promo_codes_created_by_fkey,
  ADD CONSTRAINT promo_codes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.curated_sources
  DROP CONSTRAINT curated_sources_created_by_fkey,
  ADD CONSTRAINT curated_sources_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- A share link publishes the user's own saved work, so it goes with the account.
ALTER TABLE public.shared_items
  DROP CONSTRAINT shared_items_created_by_fkey,
  ADD CONSTRAINT shared_items_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.admin_announcements ALTER COLUMN created_by DROP NOT NULL;

-- Announcements name their author and recipients without foreign keys.
CREATE FUNCTION private.clear_deleted_user_announcements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.admin_announcements SET created_by = NULL WHERE created_by = OLD.id;

  -- An announcement left with no recipients cannot satisfy its target shape.
  DELETE FROM public.admin_announcements
  WHERE OLD.id = ANY (target_user_ids)
    AND cardinality(array_remove(target_user_ids, OLD.id)) = 0;

  UPDATE public.admin_announcements
  SET target_user_ids = array_remove(target_user_ids, OLD.id)
  WHERE OLD.id = ANY (target_user_ids);

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.clear_deleted_user_announcements() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.clear_deleted_user_announcements();

-- Account deletion removes the workspaces a user owns, with every document, and
-- the user's own sources, threads, messages, and results in other workspaces.
-- The account function calls this after Stripe is canceled and immediately
-- before deleting the auth user.
CREATE FUNCTION public.prepare_account_deletion(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.workspaces WHERE owner_id = p_user_id;
  DELETE FROM public.workspace_thread_messages WHERE author_id = p_user_id;
  DELETE FROM public.workspace_threads WHERE created_by = p_user_id;
  DELETE FROM public.workspace_artifacts WHERE created_by = p_user_id;
  DELETE FROM public.workspace_sources WHERE created_by = p_user_id;
END;
$$;

-- Everything the user owns, as one JSON document. Rows are found through every
-- single-column foreign key into auth.users, so a new user-owned table is
-- exported without changing this function.
CREATE FUNCTION public.export_account_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Credentials and server-side integrity values are not the user's data to carry away.
  v_redacted constant text[] := ARRAY['key_ciphertext', 'claim_token', 'request_fingerprint'];
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
      string_agg(format('%I = $1', reference.attname), ' OR ' ORDER BY reference.attname) AS predicate
    FROM pg_constraint AS fk
    JOIN pg_class AS owner ON owner.oid = fk.conrelid
    JOIN pg_namespace AS schema ON schema.oid = owner.relnamespace
    JOIN pg_attribute AS reference ON reference.attrelid = fk.conrelid AND reference.attnum = fk.conkey[1]
    WHERE fk.contype = 'f'
      AND fk.confrelid = 'auth.users'::regclass
      AND cardinality(fk.conkey) = 1
      AND schema.nspname = 'public'
    GROUP BY owner.oid, owner.relname
    ORDER BY owner.relname
  LOOP
    EXECUTE format(
      'SELECT jsonb_agg(to_jsonb(owned) - $2) FROM %s AS owned WHERE %s',
      v_table.relation,
      v_table.predicate
    )
    INTO v_rows
    USING p_user_id, v_redacted;

    IF v_rows IS NOT NULL THEN
      v_data := v_data || jsonb_build_object(v_table.name, v_rows);
    END IF;
  END LOOP;

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

  -- Announcements addressed to the user, without the other recipients.
  SELECT jsonb_agg(to_jsonb(announcement) - 'target_user_ids'::text - 'created_by'::text)
  INTO v_rows
  FROM public.admin_announcements AS announcement
  WHERE p_user_id = ANY (announcement.target_user_ids);
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

-- What the Edge Function must clear outside Postgres before deleting the auth
-- user: Stripe customers to cancel and Storage objects to remove. Storage
-- forbids deleting objects with SQL, so the function uses the Storage API.
CREATE FUNCTION public.account_deletion_plan(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'stripe_customer_ids', (
      SELECT coalesce(jsonb_agg(DISTINCT subscription.stripe_customer_id), '[]'::jsonb)
      FROM public.subscriptions AS subscription
      WHERE subscription.user_id = p_user_id
        AND subscription.stripe_customer_id IS NOT NULL
    ),
    'storage_objects', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('bucket_id', object.bucket_id, 'name', object.name)), '[]'::jsonb)
      FROM storage.objects AS object
      WHERE object.owner = p_user_id
        OR object.owner_id = p_user_id::text
        OR object.name IN (SELECT file.storage_key FROM public.source_files AS file WHERE file.user_id = p_user_id)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.export_account_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_plan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_account_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_plan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion(uuid) TO service_role;
