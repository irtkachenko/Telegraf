-- ============================================================
-- Push підписки: мультидевайс
-- Дозволяє одному юзеру мати кілька підписок (кілька пристроїв).
-- ============================================================

-- 1) Дедуплікація: лишити один рядок на унікальний endpoint.
delete from public.user_push_subscriptions a
using public.user_push_subscriptions b
where a.user_id = b.user_id
  and a.id <> b.id
  and (
    a.updated_at < b.updated_at
    or (a.updated_at = b.updated_at and a.id < b.id)
  );

-- 2) Зняти старий UNIQUE(user_id) — він блокує мультидевайс.
alter table public.user_push_subscriptions
  drop constraint if exists unique_user_subscription;

-- 3) Унікальність endpoint у межах юзера — один пристрій = один рядок.
create unique index if not exists idx_user_push_subscriptions_user_endpoint
  on public.user_push_subscriptions (user_id, (subscription->>'endpoint'));

-- 4) Функція rpc_upsert_push_subscription тепер орієнтується на endpoint,
--    а не на user_id — щоб не затирати підписки інших пристроїв.
create or replace function public.rpc_upsert_push_subscription(
  p_subscription jsonb
) returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
declare
  v_endpoint text := p_subscription->>'endpoint';
begin
  delete from public.user_push_subscriptions
  where subscription->>'endpoint' = v_endpoint
    and user_id is distinct from auth.uid();

  insert into public.user_push_subscriptions (user_id, subscription)
  values (auth.uid(), p_subscription)
  on conflict (user_id, (subscription->>'endpoint'))
  do update set subscription = p_subscription;
end;
$$;

grant execute on function public.rpc_upsert_push_subscription(jsonb) to authenticated;