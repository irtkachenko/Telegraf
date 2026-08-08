-- =============================================================
-- Fix Google OAuth registration for new users
-- =============================================================
-- Problem:
--   New users (emails not already in public.users) could NOT sign up
--   via Google OAuth, while existing users could sign in fine.
--
-- Root cause:
--   The `handle_new_user` trigger (on_auth_user_created) was either
--   missing on the remote DB, or pointed at a broken function that
--   referenced the non-existent `public.user` table (see the old
--   2026-05-03 database dump). When the trigger fails, PostgreSQL
--   rolls back the entire auth.users INSERT, so brand-new accounts
--   can never be created.
--
-- Fix:
--   1. Recreate `handle_new_user` with a robust implementation that:
--      - targets the correct `public.users` table
--      - uses `NEW.id` directly (uuid -> uuid, no text cast)
--      - extracts name/avatar from ALL common Google metadata keys
--      - uses ON CONFLICT (id) DO NOTHING (idempotent, never fails)
--   2. Recreate the `on_auth_user_created` trigger on auth.users.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name  text := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1),
    NULL
  );
  v_image text := COALESCE(
    NEW.raw_user_meta_data->>'picture',
    NEW.raw_user_meta_data->>'avatar_url',
    NULL
  );
BEGIN
  INSERT INTO public.users (id, email, name, image)
  VALUES (NEW.id, NEW.email, v_name, v_image)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Recreate the trigger so it always exists and points at the fixed function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Keep grants consistent with other functions
GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;