-- ============================================================
-- E2EE: Додаємо інфраструктуру для наскрізного шифрування
-- ============================================================

-- 1) Таблиця публічних ключів користувачів
create table if not exists public.public_keys (
    user_id uuid primary key references public.users(id) on delete cascade,
    public_key_jwk jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Індекс для швидкого пошуку
create index if not exists idx_public_keys_user_id on public.public_keys(user_id);

-- Trigger для оновлення updated_at
create or replace function public.update_public_keys_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql security definer;

create trigger trg_public_keys_updated_at
    before update on public.public_keys
    for each row
    execute function public.update_public_keys_updated_at();

-- RLS для public_keys
alter table public.public_keys enable row level security;

-- Кожен користувач може додавати/оновлювати тільки свій ключ
create policy "Users can upsert their own public key"
    on public.public_keys
    for insert
    to authenticated
    with check (user_id = auth.uid());

create policy "Users can update their own public key"
    on public.public_keys
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Дозволяємо читати публічні ключі інших користувачів (вони публічні)
create policy "Anyone can read public keys"
    on public.public_keys
    for select
    to authenticated
    using (true);

-- 2) Додаємо поля для зашифрованого контенту в messages
alter table public.messages
    add column if not exists encrypted_content text,
    add column if not exists encrypted_iv text;

comment on column public.messages.encrypted_content is 'Base64-encoded AES-GCM ciphertext of the message content';
comment on column public.messages.encrypted_iv is 'Base64-encoded IV used for AES-GCM encryption of the content';

-- 3) Функція для збереження/оновлення публічного ключа
create or replace function public.rpc_upsert_public_key(
    p_public_key_jwk jsonb
) returns void
    language plpgsql security definer
    set search_path to 'public'
as $$
begin
    insert into public.public_keys (user_id, public_key_jwk)
    values (auth.uid(), p_public_key_jwk)
    on conflict (user_id)
    do update set public_key_jwk = p_public_key_jwk;
end;
$$;

grant execute on function public.rpc_upsert_public_key(jsonb) to authenticated;

-- 4) Функція для отримання публічного ключа користувача
create or replace function public.rpc_get_public_key(
    p_user_id uuid
) returns jsonb
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
    v_key jsonb;
begin
    select public_key_jwk into v_key
    from public.public_keys
    where user_id = p_user_id;

    return v_key;
end;
$$;

grant execute on function public.rpc_get_public_key(uuid) to authenticated;

-- 5) Функція для відправки зашифрованих повідомлень
create or replace function public.rpc_send_encrypted_message(
    p_chat_id uuid,
    p_content text default null,
    p_encrypted_content text default null,
    p_encrypted_iv text default null,
    p_reply_to_id uuid default null,
    p_attachments jsonb default '[]'::jsonb,
    p_client_id uuid default null
) returns public.messages
    language plpgsql security definer
    set search_path to 'public'
as $
declare
    new_message public.messages;
    v_is_participant boolean;
begin
    select exists (
        select 1
        from public.chats
        where id = p_chat_id
          and (user_id = auth.uid() or recipient_id = auth.uid())
    ) into v_is_participant;

    if not v_is_participant then
        raise exception 'Forbidden: You are not a participant in this chat' using errcode = '42501';
    end if;

    insert into public.messages(chat_id, sender_id, content, encrypted_content, encrypted_iv, reply_to_id, attachments, client_id)
    values (p_chat_id, auth.uid(), p_content, p_encrypted_content, p_encrypted_iv, p_reply_to_id, p_attachments, p_client_id)
    returning * into new_message;

    return new_message;
end;
$;

grant execute on function public.rpc_send_encrypted_message(uuid, text, text, text, uuid, jsonb, uuid) to authenticated;
