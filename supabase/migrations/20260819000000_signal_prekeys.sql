-- ============================================================
-- Signal Protocol pre-key storage (X3DH pre-keys).
--
-- Each device keeps a Signal identity, a registration id, one signed
-- pre-key and a pool of one-time pre-keys. The public parts are stored
-- server-side so other devices can fetch a PreKeyBundle and establish
-- an X3DH session (this fixes "cannot message a brand-new user").
-- Private keys never leave the client.
-- ============================================================

-- 1) Extend devices with Signal identity / pre-key fields
alter table public.devices
    add column if not exists registration_id integer,
    add column if not exists identity_key text,
    add column if not exists signed_pre_key_id integer,
    add column if not exists signed_pre_key text,
    add column if not exists signed_pre_key_signature text,
    add column if not exists signed_pre_key_created_at timestamptz,
    add column if not exists one_time_pre_key_count integer not null default 0;

comment on column public.devices.registration_id is 'Signal registration id (device-local random int)';
comment on column public.devices.identity_key is 'Signal identity public key (base64 X25519)';
comment on column public.devices.signed_pre_key_id is 'Id of the signed pre key';
comment on column public.devices.signed_pre_key is 'Signed pre key public key (base64)';
comment on column public.devices.signed_pre_key_signature is 'Signature of the signed pre key by the identity key (base64)';
comment on column public.devices.one_time_pre_key_count is 'Number of unconsumed one-time pre keys on the server';

-- 2) One-time pre key pool
create table if not exists public.one_time_pre_keys (
    id uuid primary key default gen_random_uuid(),
    device_id uuid not null references public.devices(id) on delete cascade,
    pre_key_id integer not null,
    pre_key text not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (device_id, pre_key_id)
);

create index if not exists idx_one_time_pre_keys_available
    on public.one_time_pre_keys(device_id) where consumed_at is null;

-- One-time pre keys are private (only consumable via security-definer RPC).
-- Only the owning user may write them directly.
alter table public.one_time_pre_keys enable row level security;

drop policy if exists "one_time_pre_keys: owner write" on public.one_time_pre_keys;
create policy "one_time_pre_keys: owner write"
    on public.one_time_pre_keys
    for all
    to authenticated
    using (exists (
        select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid()
    ))
    with check (exists (
        select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid()
    ));

-- 3) RPC: register/update the Signal identity of a device and upload a batch
--    of one-time pre keys (replacing the unconsumed pool).
create or replace function public.rpc_upsert_signal_device(
    p_device_id uuid,
    p_registration_id integer,
    p_identity_key text,
    p_signed_pre_key_id integer,
    p_signed_pre_key text,
    p_signed_pre_key_signature text,
    p_one_time_pre_keys jsonb default '[]'::jsonb
) returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
    v_user_id uuid;
begin
    select d.user_id into v_user_id from public.devices d where d.id = p_device_id;
    if v_user_id is null or v_user_id <> auth.uid() then
        raise exception 'Forbidden: not your device' using errcode = '42501';
    end if;

    update public.devices
       set registration_id = p_registration_id,
           identity_key = p_identity_key,
           signed_pre_key_id = p_signed_pre_key_id,
           signed_pre_key = p_signed_pre_key,
           signed_pre_key_signature = p_signed_pre_key_signature,
           signed_pre_key_created_at = now(),
           last_seen_at = now(),
           one_time_pre_key_count =
               (select count(*) from jsonb_array_elements(p_one_time_pre_keys))
     where id = p_device_id;

    delete from public.one_time_pre_keys
     where device_id = p_device_id and consumed_at is null;

    insert into public.one_time_pre_keys (device_id, pre_key_id, pre_key)
    select p_device_id, (k->>'keyId')::int, k->>'publicKey'
    from jsonb_array_elements(p_one_time_pre_keys) k;
end;
$$;

grant execute on function public.rpc_upsert_signal_device(uuid, integer, text, integer, text, text, jsonb) to authenticated;

-- 4) RPC: fetch a device's Signal bundle (identity + signed pre key + one
--    available one-time pre key). The one-time pre key is consumed atomically.
create or replace function public.rpc_get_signal_bundle(p_device_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
    v_otp_id integer;
    v_otp_key text;
    v_bundle jsonb;
begin
    select pre_key_id, pre_key into v_otp_id, v_otp_key
    from public.one_time_pre_keys
    where device_id = p_device_id and consumed_at is null
    order by pre_key_id
    limit 1
    for update skip locked;

    if v_otp_id is not null then
        update public.one_time_pre_keys
           set consumed_at = now()
         where device_id = p_device_id and pre_key_id = v_otp_id;
    end if;

    update public.devices
       set one_time_pre_key_count = (
           select count(*) from public.one_time_pre_keys
            where device_id = p_device_id and consumed_at is null
       )
     where id = p_device_id;

    select jsonb_build_object(
        'identity_key', d.identity_key,
        'registration_id', d.registration_id,
        'signed_pre_key_id', d.signed_pre_key_id,
        'signed_pre_key', d.signed_pre_key,
        'signed_pre_key_signature', d.signed_pre_key_signature,
        'one_time_pre_key_id', v_otp_id,
        'one_time_pre_key', v_otp_key
    ) into v_bundle
    from public.devices d
    where d.id = p_device_id;

    return v_bundle;
end;
$$;

grant execute on function public.rpc_get_signal_bundle(uuid) to authenticated;

-- 5) RPC: report how many unconsumed one-time pre keys a device still has on
--    the server, so the client knows when to refill.
create or replace function public.rpc_get_one_time_pre_key_count(p_device_id uuid)
returns integer
language sql security definer
set search_path to 'public'
as $$
    select one_time_pre_key_count from public.devices where id = p_device_id;
$$;

grant execute on function public.rpc_get_one_time_pre_key_count(uuid) to authenticated;

-- 6) RPC: refill the one-time pre key pool with a fresh batch (keeps any
--    existing unconsumed keys, skipping duplicate ids).
create or replace function public.rpc_refill_one_time_pre_keys(
    p_device_id uuid,
    p_one_time_pre_keys jsonb
) returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
    v_user_id uuid;
begin
    select d.user_id into v_user_id from public.devices d where d.id = p_device_id;
    if v_user_id is null or v_user_id <> auth.uid() then
        raise exception 'Forbidden: not your device' using errcode = '42501';
    end if;

    insert into public.one_time_pre_keys (device_id, pre_key_id, pre_key)
    select p_device_id, (k->>'keyId')::int, k->>'publicKey'
    from jsonb_array_elements(p_one_time_pre_keys) k
    on conflict (device_id, pre_key_id) do nothing;

    update public.devices
       set one_time_pre_key_count = (
           select count(*) from public.one_time_pre_keys
            where device_id = p_device_id and consumed_at is null
       )
     where id = p_device_id;
end;
$$;

grant execute on function public.rpc_refill_one_time_pre_keys(uuid, jsonb) to authenticated;