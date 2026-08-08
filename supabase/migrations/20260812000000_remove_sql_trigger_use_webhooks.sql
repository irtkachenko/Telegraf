-- ============================================================
-- Видалення SQL-тригера send_push_notification.
-- 
-- Замість нього використовуємо Supabase Database Webhooks:
--   Dashboard → Database → Webhooks → Create webhook
--     Table: messages
--     Event: INSERT
--     Edge function: send-push-notification
--
-- Webhook автоматично додає service_role авторизацію,
-- тому НЕ потрібно хардкодити service_role_key у SQL.
-- ============================================================

-- Видалити тригер
drop trigger if exists on_message_insert on public.messages;

-- Видалити функцію
drop function if exists public.send_push_notification();

-- Коментар для документації (залишимо в Гіт-історії)
comment on table public.messages is 'Push notifications are sent via Database Webhook (messages.INSERT → send-push-notification edge function)';