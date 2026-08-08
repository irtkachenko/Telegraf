-- ============================================================
-- Multi-device Push Subscriptions
-- Removes single-user restriction so a user can receive push
-- notifications on multiple devices (e.g. Phone + PC)
-- ============================================================

-- 1) Remove the single-user restriction if present
alter table if exists public.user_push_subscriptions
  drop constraint if exists unique_user_subscription;

-- 2) Update functions to work with endpoints
create or replace function public.rpc_upsert_push_subscription(
  p_subscription jsonb
) returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
declare
  v_endpoint text;
begin
  v_endpoint := p_subscription->>'endpoint';
  
  if v_endpoint is null then
    return;
  end if;

  -- Delete any subscription with the same endpoint (even if associated with previous user)
  delete from public.user_push_subscriptions
  where subscription->>'endpoint' = v_endpoint;

  -- Insert subscription for the current user
  insert into public.user_push_subscriptions (user_id, subscription)
  values (auth.uid(), p_subscription);
end;
$$;

grant execute on function public.rpc_upsert_push_subscription(jsonb) to authenticated;

create or replace function public.rpc_delete_push_subscription(
  p_endpoint text default null
) returns void
  language plpgsql security definer
  set search_path to 'public'
as $$
begin
  if p_endpoint is not null then
    delete from public.user_push_subscriptions
    where user_id = auth.uid()
      and subscription->>'endpoint' = p_endpoint;
  else
    delete from public.user_push_subscriptions
    where user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.rpc_delete_push_subscription(text) to authenticated;
