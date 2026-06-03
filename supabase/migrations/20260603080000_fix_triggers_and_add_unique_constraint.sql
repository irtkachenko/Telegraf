-- Fix: hardened search_users (avoid E'\\' syntax that breaks Supabase CLI)
-- The original migration 20260322123000 is marked as applied via migration repair.

CREATE OR REPLACE FUNCTION public.search_users(p_query text)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  image text,
  last_seen timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_query text;
  v_safe_query text;
BEGIN
  v_query := LEFT(TRIM(COALESCE(p_query, '')), 100);

  IF LENGTH(v_query) < 2 THEN
    RETURN;
  END IF;

  -- Block empty/wildcard-only probes like '%%' or '__'
  IF REGEXP_REPLACE(v_query, '[\s%_]', '', 'g') = '' THEN
    RETURN;
  END IF;

  -- Per-user search throttling (60 requests / minute)
  PERFORM public.check_action_limit('users_search', 60, 60);

  -- Escape wildcard characters to force literal matching (without E'\\' syntax)
  v_safe_query := v_query;
  v_safe_query := REPLACE(v_safe_query, '\', '\\');
  v_safe_query := REPLACE(v_safe_query, '%', '\%');
  v_safe_query := REPLACE(v_safe_query, '_', '\_');

  RETURN QUERY
  SELECT
    u.id,
    u.name,
    u.email,
    u.image,
    u.last_seen
  FROM public.users u
  WHERE
    u.id <> auth.uid()
    AND u.email ILIKE '%' || v_safe_query || '%' ESCAPE '\'
  ORDER BY u.email
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(text) TO authenticated;

-- Fix: handle_new_user referenced non-existent table public.user instead of public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, image)
  VALUES (
    NEW.id::text,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Fix: handle_user_delete referenced non-existent table public.user instead of public.users
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id::text;
  RETURN OLD;
END;
$$;

-- Add UNIQUE constraint on (user_id, recipient_id) to prevent duplicate chats
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chats_user_recipient_unique"
  ON "public"."chats" ("user_id", "recipient_id")
  WHERE "recipient_id" IS NOT NULL;

-- Cleanup: drop obsolete drizzle schema (dead code from previous ORM)
DROP SCHEMA IF EXISTS "drizzle" CASCADE;