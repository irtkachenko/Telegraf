-- ============================================================
-- Vidnovlennya vidsutnoyi skhemy supabase_functions
--
-- Problema: stvorennya Database Webhook u Dashboard padae z:
--   ERROR: 3F000: schema "supabase_functions" does not exist
-- Dashboard generue SQL, shcho vyklykae supabase_functions.http_request(...),
-- ale na tsomu proekti skhemy supabase_functions nemaie
-- (dyv. istoriyu v 20260811000002_fix_push_subscriptions_dedup_v3.sql).
--
-- Tsya migratsiya:
--   1) stvoryuie skhemu supabase_functions (yakscho yiyi nemaie),
--   2) stvoryuie http_request(...) - sumisnu obtortku nad pg_net
--      (net.http_post), yaka vzhe pratsyue na tsomu proekti.
-- ============================================================

-- 1) Skhema
create schema if not exists supabase_functions;

grant usage on schema supabase_functions to postgres, anon, authenticated, service_role;
alter default privileges in schema supabase_functions
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema supabase_functions
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema supabase_functions
  grant all on sequences to postgres, anon, authenticated, service_role;

-- 2) Peresvatys, shcho pg_net dostupnyi (neobkhidnyi webhook-am)
create extension if not exists pg_net with schema extensions;
grant usage on schema net to postgres, anon, authenticated, service_role;
grant execute on function net.http_post to postgres, service_role, anon, authenticated;

-- 3) Obtortka http_request poverkh net.http_post
--    Syhnatura sumisna z tym, shcho generue Dashboard.
create or replace function supabase_functions.http_request(
  url text,
  method text default 'POST',
  headers jsonb default '{}'::jsonb,
  body text default ''::text,
  timeout_ms integer default 1000
)
returns bigint
language plpgsql
security definer
set search_path = net, extensions, public
as $$
declare
  request_id bigint;
begin
  if upper(coalesce(method, 'POST')) <> 'POST' then
    raise exception 'supabase_functions.http_request: unsupported method % (only POST)', method;
  end if;

  select net.http_post(
    url,
    coalesce(headers, '{}'::jsonb),
    coalesce(nullif(trim(coalesce(body, '')), ''), '{}')::jsonb,
    coalesce(timeout_ms, 1000)
  ) into request_id;

  return request_id;
end;
$$;

grant execute on function supabase_functions.http_request(text, text, jsonb, text, integer)
  to postgres, anon, authenticated, service_role;

comment on function supabase_functions.http_request(text, text, jsonb, text, integer) is
  'Wrapper over pg_net net.http_post used by Database Webhooks';