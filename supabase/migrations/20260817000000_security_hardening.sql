-- ============================================================
-- SECURITY HARDENING: revoke broad `anon` privileges & lock policies
--
-- The early remote-schema dump granted `GRANT ALL ... TO anon` on many
-- functions (including SECURITY DEFINER RPCs and the search_users email
-- search) and on key tables. Because `CREATE OR REPLACE FUNCTION` preserves
-- the ACLs on the same function OID, later per-function grants to
-- `authenticated` did NOT remove the existing `anon` grants. This migration:
--   1) revokes function execution from `anon` (keeps authenticated/service_role),
--   2) revokes raw table privileges from `anon` (RLS remains the backstop),
--   3) narrows the permissive `FOR SELECT ... TO public` policies to
--      `authenticated`.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) Revoke function execution from `anon`
--    Wrapped in a loop so a function that no longer exists (dropped or
--    renamed in an earlier migration) does not abort the whole migration.
-- ------------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.check_action_limit(text, integer, integer, uuid)',
    'public.cleanup_rate_limits()',
    'public.delete_expired_assets()',
    'public.enforce_chats_rate_limit()',
    'public.enforce_messages_rate_limit()',
    'public.handle_message_update()',
    'public.handle_new_user()',
    'public.handle_user_delete()',
    'public.rpc_create_chat(uuid)',
    'public.rpc_delete_message(uuid)',
    'public.rpc_delete_push_subscription()',
    'public.rpc_edit_message(uuid, text)',
    'public.rpc_mark_chat_as_read(uuid, uuid)',
    'public.rpc_send_message(uuid, text, uuid, jsonb, uuid)',
    'public.rpc_send_encrypted_message(uuid, text, text, text, uuid, jsonb, uuid)',
    'public.search_users(text)',
    'public.update_last_seen()',
    'public.update_updated_at_column()'
  ]
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXCEPTION WHEN others THEN
      -- ignore missing/already-revoked function
      NULL;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 2) Revoke raw table privileges from `anon`.
--    RLS is enabled on all of these, but we remove the raw grants too so the
--    `anon` role can never read/modify rows even if a policy is ever
--    misconfigured or RLS is accidentally disabled on a table.
-- ------------------------------------------------------------------
REVOKE ALL ON TABLE public.chats                  FROM anon;
REVOKE ALL ON TABLE public.messages               FROM anon;
REVOKE ALL ON TABLE public.users                  FROM anon;
REVOKE ALL ON TABLE public.user_push_subscriptions FROM anon;
REVOKE ALL ON TABLE public.public_keys            FROM anon;
REVOKE ALL ON TABLE public.rate_limits            FROM anon;
REVOKE ALL ON TABLE public.rate_limit_config      FROM anon;

-- Also stop default `anon` grants on future objects created in `public`.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ------------------------------------------------------------------
-- 3) Ensure the email-search RPC is callable by authenticated users only.
-- ------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;

-- ------------------------------------------------------------------
-- 4) Narrow permissive `FOR SELECT ... TO public` policies to `authenticated`.
--    Same USING expressions as before; `anon` could not match them anyway
--    (auth.uid() is NULL), but this removes the unnecessary public exposure.
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'chats'
      AND policyname = 'Users can view own chats'
  ) THEN
    EXECUTE 'ALTER POLICY "Users can view own chats" ON public.chats TO authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'Users can view chat messages'
  ) THEN
    EXECUTE 'ALTER POLICY "Users can view chat messages" ON public.messages TO authenticated';
  END IF;
END $$;
