-- ============================================================
-- Per-device E2EE keys (Signal/WhatsApp-style multi-device).
-- Кожен пристрій має свій ключ; повідомлення шифрується один раз
-- ключем повідомлення, який обгортається окремо для кожного пристрою.
-- ============================================================

-- 1) Таблиця пристроїв користувача
create table if not exists public.devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    public_key_jwk jsonb not null,
    name text,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

create index if not exists idx_devices_user_id on public.devices(user_id);

alter table public.devices enable row level security;

-- Користувач керує власними пристроями
create policy "Devices: insert own"
    on public.devices for insert to authenticated
    with check (user_id = auth.uid());

create policy "Devices: update own"
    on public.devices for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "Devices: delete own"
    on public.devices for delete to authenticated
    using (user_id = auth.uid());

-- Публічні ключі пристроїв можна читати всім (вони публічні)
create policy "Devices: read all public keys"
    on public.devices for select to authenticated
    using (true);

-- 2) Поля для багатопристроєвого шифрування в messages
alter table public.messages
    add column if not exists sender_device_id uuid,
    add column if not exists sender_device_public_key jsonb,
    add column if not exists message_keys jsonb;

comment on column public.messages.sender_device_id is 'Пристрій-відправник (devices.id)';
comment on column public.messages.sender_device_public_key is 'Публічний ключ пристрою-відправника (JWK)';
comment on column public.messages.message_keys is 'Ключ повідомлення, обгорнутий окремо для кожного пристрою одержувача: [{device_id, key, iv}]';

-- 3) RPC для надсилання зашифрованого повідомлення з обгортками ключів
create or replace function public.rpc_send_encrypted_message(
    p_chat_id uuid,
    p_content text default null,
    p_encrypted_content text default null,
    p_encrypted_iv text default null,
    p_reply_to_id uuid default null,
    p_attachments jsonb default '[]'::jsonb,
    p_client_id uuid default null,
    p_sender_device_id uuid default null,
    p_sender_device_public_key jsonb default null,
    p_message_keys jsonb default '[]'::jsonb
) returns public.messages
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
    new_message public.messages;
    v_is_participant boolean;
begin
    select exists (
        select 1 from public.chats
        where id = p_chat_id
          and (user_id = auth.uid() or recipient_id = auth.uid())
    ) into v_is_participant;

    if not v_is_participant then
        raise exception 'Forbidden: You are not a participant in this chat' using errcode = '42501';
    end if;

    insert into public.messages(
        chat_id, sender_id, content, encrypted_content, encrypted_iv,
        reply_to_id, attachments, client_id, sender_device_id, sender_device_public_key, message_keys
    )
    values (
        p_chat_id, auth.uid(), p_content, p_encrypted_content, p_encrypted_iv,
        p_reply_to_id, p_attachments, p_client_id, p_sender_device_id, p_sender_device_public_key, p_message_keys
    )
    returning * into new_message;

    return new_message;
end;
$$;

grant execute on function public.rpc_send_encrypted_message(uuid, text, text, text, uuid, jsonb, uuid, uuid, jsonb, jsonb) to authenticated;
