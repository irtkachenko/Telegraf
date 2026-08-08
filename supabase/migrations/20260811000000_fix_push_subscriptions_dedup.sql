-- ============================================================
-- Виправлення push-підписок:
-- 1) Видалення дублікатів (однаковий endpoint для одного юзера).
-- 2) Перепис тригера на supabase_functions.http_request()
--    замість net.http_post з хардкодом service_role_key.
-- ============================================================

-- 1) Видалити дублікати: лишити один рядок на унікальний (user_id, endpoint).
delete from public.user_push_subscriptions a
using public.user_push_subscriptions b
where a.user_id = b.user_id
  and a.id <> b.id
  and a.subscription->>'endpoint' = b.subscription->>'endpoint'
  and (
    a.updated_at < b.updated_at
    or (a.updated_at = b.updated_at and a.id < b.id)
  );

-- 2) Переконатися, що унікальний індекс існує (один пристрій = один рядок).
create unique index if not exists idx_user_push_subscriptions_user_endpoint
  on public.user_push_subscriptions (user_id, (subscription->>'endpoint'));

-- 3) Налаштувати app.supabase_url для поточного проєкту.
--    Це дозволяє supabase_functions.http_request() знати URL проєкту.
--    (URL не є секретним — він публічний.)
do $$
begin
  if not exists (
    select 1 from pg_settings where name = 'app.supabase_url'
  ) then
    perform set_config('app.supabase_url', 'https://qdvtruuujxmjmmtbsizq.supabase.co', false);
  end if;
end $$;

-- 4) Переписати тригер на supabase_functions.http_request().
--    Ця функція автоматично підставляє service_role key,
--    тому не потрібно хардкодити ключ у SQL.
create or replace function public.send_push_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recipient_id uuid;
  chat_record record;
  payload jsonb;
  v_supabase_url text;
begin
  -- Only process if this is a new message (not an update)
  if tg_op = 'INSERT' then
    -- Get chat info to find recipient
    select c.user_id, c.recipient_id
    into chat_record
    from public.chats as c
    where c.id = new.chat_id;

    -- Determine recipient (the one who is NOT the sender)
    if chat_record.user_id = new.sender_id then
      v_recipient_id := chat_record.recipient_id;
    else
      v_recipient_id := chat_record.user_id;
    end if;

    -- Skip if no recipient or recipient is the sender
    if v_recipient_id is null or v_recipient_id = new.sender_id then
      return new;
    end if;

    -- Prepare payload for Edge Function
    payload := jsonb_build_object(
      'messageId', new.id,
      'chatId', new.chat_id,
      'senderId', new.sender_id,
      'content', new.content,
      'chatName', 'Чат'
    );

    -- Get Supabase URL (fallback to hardcoded project URL — it's public, not secret)
    v_supabase_url := coalesce(
      current_setting('app.supabase_url', true),
      'https://qdvtruuujxmjmmtbsizq.supabase.co'
    );

    -- Call Edge Function asynchronously using supabase_functions.http_request.
    -- This function automatically adds the service_role key header,
    -- so we don't need to hardcode it in SQL.
    perform extensions.supabase_functions.http_request(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      method := 'POST',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := payload
    );

    -- Log the attempt (optional, for debugging)
    raise log 'Push notification triggered for message % to user %', new.id, v_recipient_id;
  end if;

  return new;
end;
$$;

-- Recreate trigger (it will automatically use the updated function)
drop trigger if exists on_message_insert on public.messages;
create trigger on_message_insert
  after insert on public.messages
  for each row
  execute function public.send_push_notification();

-- Grant execute permission on supabase_functions.http_request
grant execute on function extensions.supabase_functions.http_request to postgres, service_role;

-- Comment
comment on function send_push_notification() is 'Triggers push notification via Edge Function when a new message is inserted';
comment on trigger on_message_insert on messages is 'Sends push notification to recipient when a new message arrives';