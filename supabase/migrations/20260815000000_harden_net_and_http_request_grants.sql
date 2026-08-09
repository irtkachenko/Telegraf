-- ============================================================
-- Безпека: забрати доступ anon/authenticated до net.* та
-- supabase_functions.http_request (SSRF-ризик).
--
-- Залишаємо ці можливості тільки для службових ролей
-- (postgres / service_role), які використовуються Database Webhooks.
-- ============================================================

-- 1) Забороняємо USAGE на схему net для клієнтських ролей.
--    Це остаточно блокує anon/authenticated від будь-яких net.* функцій.
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;

-- 2) Те саме для схеми supabase_functions (wrapper http_request для webhooks).
REVOKE USAGE ON SCHEMA supabase_functions FROM anon, authenticated;

-- 3) Додатково знімаємо EXECUTE на net.http_post (усі перевантаження)
--    та supabase_functions.http_request у безпечний, ідемпотентний спосіб
--    (якщо якесь перевантаження відсутнє — просто пропускаємо).
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, integer) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  BEGIN
    REVOKE EXECUTE ON FUNCTION supabase_functions.http_request(text, text, jsonb, text, integer) FROM anon, authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;
