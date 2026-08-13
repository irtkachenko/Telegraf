-- ============================================================
-- Push підписки: остаточне виправлення унікального обмеження.
--
-- Попередня міграція (20260814000000) видаляла лише
--   user_push_subscriptions_user_id_key, але в задеплоєній схемі
--   обмеження має назву unique_user_subscription (UNIQUE user_id).
-- Цей старий унікальний індекс блокує multi-device (один user_id =
-- один рядок) і залишає ризик помилки upsert/ON CONFLICT.
-- Міграція idempotent — безпечно запускається повторно.
-- ============================================================

-- 1. Видаляємо старе обмеження "один юзер = одна підписка" (назва зі схеми).
ALTER TABLE public.user_push_subscriptions
  DROP CONSTRAINT IF EXISTS unique_user_subscription;

-- 2. Резерв: видаляємо й імовірну альтернативну назву, якщо вона існує.
ALTER TABLE public.user_push_subscriptions
  DROP CONSTRAINT IF EXISTS user_push_subscriptions_user_id_key;

-- 2.5 Дедуплікація: залишаємо лише один рядок на (user_id, endpoint),
--    інакше створення унікального індексу нижче може впасти на дублікатах.
delete from public.user_push_subscriptions a
using public.user_push_subscriptions b
where a.id > b.id
  and a.user_id = b.user_id
  and a.subscription->>'endpoint' = b.subscription->>'endpoint';

-- 3. Гарантуємо унікальний складений індекс (user_id, endpoint) -
--    він потрібен для коректного перезапису та multi-device.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_push_subscriptions_user_endpoint
  ON public.user_push_subscriptions (user_id, ((subscription->>'endpoint')));

COMMENT ON INDEX idx_user_push_subscriptions_user_endpoint
  IS 'Один користувач → один рядок на endpoint (пристрій/браузер).';
