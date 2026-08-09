-- ============================================================
-- Push підписки: виправлення унікального обмеження для multi-device
--
-- Попередні міграції (20260808000000, 20260811000002) дрокнули
--   constraint "unique_user_subscription", проте у деяких середовищах
--   (де контрасттне ім'я не задавалося явно) обмеження створювалося
--   з ім'ям типу user_push_subscriptions_user_id_key.
-- Ця міграція є idempotent: безпечно запускається навіть якщо
--   попередні кроки вже виконані.
-- ============================================================

-- 1. Видаляємо старе унікальне обмеження тільки по user_id (якщо воно існує).
--    Це блокує multi-device підтримку — один user_id = одна підписка.
ALTER TABLE public.user_push_subscriptions
  DROP CONSTRAINT IF EXISTS user_push_subscriptions_user_id_key;

-- 2. Додаємо унікальність на комбінацію (user_id, endpoint),
--    де endpoint винесений у JSON subscription.
--    Один користувач → один рядок на endpoint (пристрій/браузер).
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_endpoint
  ON public.user_push_subscriptions (user_id, ((subscription->>'endpoint')));

-- 3. Коментар щодо призначення індексу.
COMMENT ON INDEX idx_user_push_subscriptions_user_endpoint
  IS 'Забезпечує multi-device підтримку: у одного користувача може бути декілька браузерів/пристроїв.';
