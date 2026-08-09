-- ============================================================
-- Безпека: rpc_upsert_push_subscription більше НЕ видаляє чужі підписки.
--
-- Раніше функція видаляла рядок за endpoint у БУДЬ-ЯКОГО іншого
-- користувача (user_id is distinct from auth.uid()), що дозволяло
-- зловмиснику, який знає чийсь endpoint, зняти чужу push-підписку.
--
-- Тепер UPSERT обробляє лише рядок ПОТОЧНОГО користувача
-- (унікальний індекс (user_id, endpoint) сам гарантує «один пристрій =
-- один рядок»), тож крос-юзерське видалення не потрібне і прибране.
-- ============================================================

create or replace function public.rpc_upsert_push_subscription(
  p_subscription jsonb
) returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
declare
  v_endpoint text := p_subscription->>'endpoint';
begin
  if v_endpoint is null or v_endpoint = '' then
    raise exception 'Invalid subscription: missing endpoint' using errcode = 'P0001';
  end if;

  insert into public.user_push_subscriptions (user_id, subscription)
  values (auth.uid(), p_subscription)
  on conflict (user_id, (subscription->>'endpoint'))
  do update set subscription = p_subscription;
end;
$$;

grant execute on function public.rpc_upsert_push_subscription(jsonb) to authenticated;
