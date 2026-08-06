-- ============================================================
-- Web Push: Таблиця підписок пристроїв для push-сповіщень
-- ============================================================

-- 1) Таблиця підписок
create table if not exists public.user_push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  subscription jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_subscription unique(user_id)
);

-- Індекс для швидкого пошуку за user_id
create index if not exists idx_user_push_subscriptions_user_id
  on public.user_push_subscriptions(user_id);

-- Trigger для оновлення updated_at
create or replace function public.update_user_push_subscriptions_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql security definer;

create trigger trg_user_push_subscriptions_updated_at
    before update on public.user_push_subscriptions
    for each row
    execute function public.update_user_push_subscriptions_updated_at();

-- 2) RLS
alter table public.user_push_subscriptions enable row level security;

-- Кожен користувач може керувати лише своєю підпискою
create policy "Users can manage their own push subscription"
  on public.user_push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Функція для збереження/оновлення підписки
create or replace function public.rpc_upsert_push_subscription(
  p_subscription jsonb
) returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
begin
  insert into public.user_push_subscriptions (user_id, subscription)
  values (auth.uid(), p_subscription)
  on conflict (user_id)
  do update set subscription = p_subscription;
end;
$$;

grant execute on function public.rpc_upsert_push_subscription(jsonb) to authenticated;

-- 4) Функція для видалення підписки
create or replace function public.rpc_delete_push_subscription()
returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
begin
  delete from public.user_push_subscriptions
  where user_id = auth.uid();
end;
$$;

grant execute on function public.rpc_delete_push_subscription() to authenticated;