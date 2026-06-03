create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create schema if not exists "drizzle";

create schema if not exists "ratelimit";

create sequence "drizzle"."__drizzle_migrations_id_seq";


  create table "drizzle"."__drizzle_migrations" (
    "id" integer not null default nextval('drizzle.__drizzle_migrations_id_seq'::regclass),
    "hash" text not null,
    "created_at" bigint
      );



  create table "public"."chats" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "recipient_id" uuid,
    "title" text not null default 'New Chat'::text,
    "created_at" timestamp without time zone not null default now(),
    "user_last_read_id" uuid,
    "recipient_last_read_id" uuid,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."chats" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "chat_id" uuid not null,
    "sender_id" uuid not null,
    "content" text,
    "attachments" jsonb not null default '[]'::jsonb,
    "reply_to_id" uuid,
    "created_at" timestamp without time zone not null default now(),
    "updated_at" timestamp with time zone,
    "client_id" uuid
      );


alter table "public"."messages" enable row level security;


  create table "public"."rate_limit_config" (
    "action" text not null,
    "max_count" integer not null,
    "window_seconds" integer not null,
    "enabled" boolean not null default true
      );



  create table "public"."rate_limits" (
    "user_id" uuid not null,
    "action" text not null,
    "window_seconds" integer not null,
    "window_start" timestamp with time zone not null,
    "count" integer not null default 0
      );


alter table "public"."rate_limits" enable row level security;


  create table "public"."upload_audit" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "chat_id" uuid
      );



  create table "public"."users" (
    "id" uuid not null,
    "name" text,
    "email" text not null,
    "emailVerified" timestamp without time zone,
    "image" text,
    "last_seen" timestamp with time zone default now(),
    "is_online" boolean default false,
    "status" text default 'offline'::text,
    "status_message" text,
    "provider" text,
    "provider_id" text,
    "preferences" jsonb,
    "theme" text default 'system'::text,
    "created_at" timestamp without time zone default now(),
    "updated_at" timestamp without time zone default now()
      );


alter table "public"."users" enable row level security;


  create table "ratelimit"."requests" (
    "user_id" uuid not null,
    "endpoint" text not null,
    "last_request" timestamp with time zone default now(),
    "request_count" integer default 1
      );


alter sequence "drizzle"."__drizzle_migrations_id_seq" owned by "drizzle"."__drizzle_migrations"."id";

CREATE UNIQUE INDEX __drizzle_migrations_pkey ON drizzle.__drizzle_migrations USING btree (id);

CREATE UNIQUE INDEX chats_pkey ON public.chats USING btree (id);

CREATE INDEX idx_chats_last_message ON public.chats USING btree (user_id, recipient_id, id);

CREATE INDEX idx_chats_updated_at ON public.chats USING btree (updated_at DESC);

CREATE INDEX idx_chats_users ON public.chats USING btree (user_id, recipient_id);

CREATE INDEX idx_messages_chat_created ON public.messages USING btree (chat_id, created_at DESC);

CREATE INDEX idx_messages_chat_id ON public.messages USING btree (chat_id);

CREATE INDEX idx_messages_client_id ON public.messages USING btree (client_id);

CREATE INDEX idx_upload_audit_user_time ON public.upload_audit USING btree (user_id, created_at);

CREATE INDEX idx_user_email ON public.users USING btree (email);

CREATE INDEX idx_user_last_seen ON public.users USING btree (last_seen);

CREATE INDEX idx_user_provider ON public.users USING btree (provider, provider_id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE UNIQUE INDEX rate_limit_config_pkey ON public.rate_limit_config USING btree (action);

CREATE UNIQUE INDEX rate_limits_pkey ON public.rate_limits USING btree (user_id, action, window_seconds, window_start);

CREATE UNIQUE INDEX upload_audit_pkey ON public.upload_audit USING btree (id);

CREATE UNIQUE INDEX user_email_unique ON public.users USING btree (email);

CREATE UNIQUE INDEX user_pkey ON public.users USING btree (id);

CREATE UNIQUE INDEX requests_pkey ON ratelimit.requests USING btree (user_id, endpoint);

alter table "drizzle"."__drizzle_migrations" add constraint "__drizzle_migrations_pkey" PRIMARY KEY using index "__drizzle_migrations_pkey";

alter table "public"."chats" add constraint "chats_pkey" PRIMARY KEY using index "chats_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."rate_limit_config" add constraint "rate_limit_config_pkey" PRIMARY KEY using index "rate_limit_config_pkey";

alter table "public"."rate_limits" add constraint "rate_limits_pkey" PRIMARY KEY using index "rate_limits_pkey";

alter table "public"."upload_audit" add constraint "upload_audit_pkey" PRIMARY KEY using index "upload_audit_pkey";

alter table "public"."users" add constraint "user_pkey" PRIMARY KEY using index "user_pkey";

alter table "ratelimit"."requests" add constraint "requests_pkey" PRIMARY KEY using index "requests_pkey";

alter table "public"."chats" add constraint "chats_recipient_id_user_id_fk" FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."chats" validate constraint "chats_recipient_id_user_id_fk";

alter table "public"."chats" add constraint "chats_recipient_last_read_id_fkey" FOREIGN KEY (recipient_last_read_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."chats" validate constraint "chats_recipient_last_read_id_fkey";

alter table "public"."chats" add constraint "chats_user_id_user_id_fk" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."chats" validate constraint "chats_user_id_user_id_fk";

alter table "public"."chats" add constraint "chats_user_last_read_id_fkey" FOREIGN KEY (user_last_read_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."chats" validate constraint "chats_user_last_read_id_fkey";

alter table "public"."messages" add constraint "content_length_check" CHECK ((char_length(content) <= 3000)) not valid;

alter table "public"."messages" validate constraint "content_length_check";

alter table "public"."messages" add constraint "messages_chat_id_chats_id_fk" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_chat_id_chats_id_fk";

alter table "public"."messages" add constraint "messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_chat_id_fkey";

alter table "public"."messages" add constraint "messages_reply_to_id_messages_id_fk" FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL not valid;

alter table "public"."messages" validate constraint "messages_reply_to_id_messages_id_fk";

alter table "public"."messages" add constraint "messages_sender_id_user_id_fk" FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_sender_id_user_id_fk";

alter table "public"."upload_audit" add constraint "upload_audit_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE not valid;

alter table "public"."upload_audit" validate constraint "upload_audit_chat_id_fkey";

alter table "public"."upload_audit" add constraint "upload_audit_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."upload_audit" validate constraint "upload_audit_user_id_fkey";

alter table "public"."users" add constraint "user_email_unique" UNIQUE using index "user_email_unique";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_action_limit(p_action text, p_max_count integer DEFAULT NULL::integer, p_seconds integer DEFAULT NULL::integer, p_u_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    now_ts timestamptz := now();
    window_start_ts timestamptz;
    current_count int;
    cfg_max int;
    cfg_seconds int;
    cfg_enabled boolean;
  begin
    if current_setting('request.jwt.claim.role', true) = 'service_role' then
      return true;
    end if;

    if p_u_id is null then
      raise exception 'Unauthenticated' using errcode = '28000';
    end if;

    if p_max_count is null or p_seconds is null then
      select c.max_count, c.window_seconds, c.enabled
        into cfg_max, cfg_seconds, cfg_enabled
      from public.rate_limit_config as c
      where c.action = p_action;

      if cfg_enabled is false then
        return true;
      end if;

      if cfg_max is null or cfg_seconds is null then
        raise exception 'Rate limit config missing for %', p_action
          using errcode = 'P0001';
      end if;
    else
      cfg_max := p_max_count;
      cfg_seconds := p_seconds;
      cfg_enabled := true;
    end if;

    window_start_ts := to_timestamp(floor(extract(epoch from now_ts) / cfg_seconds) * cfg_seconds);

    insert into public.rate_limits(user_id, action, window_seconds, window_start, count)
    values (p_u_id, p_action, cfg_seconds, window_start_ts, 1)
    on conflict (user_id, action, window_seconds, window_start)
    do update set count = public.rate_limits.count + 1
    returning count into current_count;

    if current_count > cfg_max then
      raise exception 'Rate limit exceeded' using errcode = 'P0001';
    end if;

    return true;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.check_action_limit(u_id uuid, action text, max_count integer, seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_count int;
BEGIN
    -- Р В Р’В Р вЂ™Р’В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р СћРІР‚ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІР‚Сљ X Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В Р’В Р В РІР‚В¦Р В Р’В Р СћРІР‚В
    SELECT count(*) INTO current_count
    FROM public.ratelimit_log
    WHERE user_id = u_id 
      AND action_type = action 
      AND created_at > now() - (seconds || ' seconds')::interval;

    IF current_count >= max_count THEN
        RETURN false;
    END IF;

    -- Р В Р’В Р Р†Р вЂљРЎвЂќР В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р СћРІР‚ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р В РІР‚в„–
    INSERT INTO public.ratelimit_log (user_id, action_type) VALUES (u_id, action);
    RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_message_rate()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    SELECT count(*) FROM messages 
    WHERE sender_id = NEW.sender_id 
    AND created_at > now() - interval '1 second'
  ) >= 2 THEN -- 2 Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В Р’В Р В РІР‚В¦Р В Р’В Р СћРІР‚ВР В Р Р‹Р РЋРІР‚Сљ - Р В Р Р‹Р Р†Р вЂљР’В Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚Сњ Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В РІР‚в„–Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚В
    RAISE EXCEPTION 'Р В Р’В Р РЋРЎС™Р В Р’В Р вЂ™Р’В°Р В Р’В Р СћРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚Сћ Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚Сћ! Р В Р’В Р РЋРЎС™Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋР’В.';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.check_upload_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    row_count INT;
    current_user_id UUID;
BEGIN
    -- Р В Р’В Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋР’ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ ID Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’В° Р В Р’В Р вЂ™Р’В· Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р Р†Р вЂљРІР‚Сњ Supabase
    current_user_id := auth.uid();

    -- Р В Р’В Р В РІР‚РЋР В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚Сћ Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚СћР В Р’В Р РЋР’В ID Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎСљ (Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р РЋР’В), Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚Сћ Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ ID Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В±'Р В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°
    IF current_user_id IS NULL THEN
        current_user_id := NEW.owner_id;
    END IF;

    -- Р В Р’В Р вЂ™Р’В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В¶Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р вЂ° Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р В РІР‚в„– Р В Р Р‹Р Р†Р вЂљР’В¦Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚Сљ
    SELECT count(*) INTO row_count
    FROM public.upload_audit
    WHERE user_id = current_user_id
      AND created_at > NOW() - INTERVAL '1 minute';

    -- Р В Р’В Р РЋРЎСџР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р РЋР’ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў (10 Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњР В Р’В Р вЂ™Р’В»Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р В РІР‚В  Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљР’В¦Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚Сљ)
    IF row_count >= 10 THEN
        RAISE EXCEPTION 'Upload rate limit exceeded. Please wait a minute.';
    END IF;

    -- Р В Р’В Р Р†Р вЂљРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњ (Р В Р’В Р РЋРІР‚С”Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В° Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚СћР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В° - Р В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚В Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ current_user_id)
    INSERT INTO public.upload_audit (user_id)
    VALUES (current_user_id);

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_expired_assets()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  delete from storage.objects
  where created_at < now() - interval '24 hours';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_physical_file_from_storage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р РЋРІР‚ВР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњ Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р вЂ™Р’В· Р В Р Р‹Р В РЎвЂњР В Р’В Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р РЋР’ВР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРІР‚Сњ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІР‚Сљ storage.objects
    -- Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В¶Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚Сћ: Р В Р’В Р РЋРІР‚вЂќР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ, Р В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В  Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р Р†Р вЂљРІР‚Сљ file_path Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р РЋРІР‚вЂњР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎСљР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В¦ Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚Сћ Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњР В Р’В Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚Сљ (Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚ВР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В»Р В Р’В Р вЂ™Р’В°Р В Р’В Р СћРІР‚В, 'folder/file.png')
    DELETE FROM storage.objects 
    WHERE bucket_id = 'uploads' -- Р В Р’В Р Р†Р вЂљРІР‚СњР В Р’В Р РЋРІР‚в„ўР В Р’В Р РЋРЎв„ўР В Р’В Р Р†Р вЂљР’В Р В Р’В Р РЋРЎС™Р В Р’В Р Р†Р вЂљР’В Р В Р’В Р РЋРЎвЂєР В Р’В Р вЂ™Р’В¬ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В° Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В·Р В Р’В Р В РІР‚В Р В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р’В Р РЋРІР‚СћР В Р’В Р РЋРІР‚вЂњР В Р’В Р РЋРІР‚Сћ Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°
      AND name = OLD.file_path; 
    
    RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_chats_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (tg_op = 'INSERT') then
    perform public.check_action_limit('chat_create', null, null, new.user_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    if (new.user_last_read_id is distinct from old.user_last_read_id)
      or (new.recipient_last_read_id is distinct from old.recipient_last_read_id) then
      perform public.check_action_limit('chat_mark_read');
    elsif (new.title is distinct from old.title) then
      perform public.check_action_limit('chat_update');
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.check_action_limit('chat_delete');
    return old;
  end if;
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_messages_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (tg_op = 'INSERT') then
    perform public.check_action_limit('message_send', null, null, new.sender_id);
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.check_action_limit('message_edit');
    return new;
  elsif (tg_op = 'DELETE') then
    perform public.check_action_limit('message_delete');
    return old;
  end if;
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_message_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Р В Р’В Р РЋРЎСџР В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ, Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р РЋРІР‚В Р В Р’В Р вЂ™Р’В·Р В Р’В Р РЋР’ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ў (Р В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В± Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚В Р В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚Сћ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚Сњ)
    IF NEW.content IS DISTINCT FROM OLD.content THEN
        NEW.updated_at = NOW();
    ELSE
        -- Р В Р’В Р В РІР‚РЋР В Р’В Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚Сћ Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р РЋР’ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р’В Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ, Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р вЂ™Р’В·Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р’В Р В РІР‚В¦Р В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏ updated_at
        NEW.updated_at = OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user (id, email, name, image)
  VALUES (
    new.id::text, -- Р В Р’В Р РЋРІР‚С”Р В Р’В Р вЂ™Р’В±Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В 'Р В Р Р‹Р В Р РЏР В Р’В Р вЂ™Р’В·Р В Р’В Р РЋРІР‚СњР В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚Сћ Р В Р’В Р СћРІР‚ВР В Р’В Р РЋРІР‚СћР В Р’В Р СћРІР‚ВР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ ::text Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_user_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.user WHERE id = old.id::text;
  RETURN old;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.limit_chat_creation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    SELECT count(*) FROM chats 
    WHERE user_id = NEW.user_id 
    AND created_at > now() - interval '1 minute'
  ) >= 7 THEN -- Р В Р’В Р РЋРЎвЂєР В Р Р‹Р В РІР‚С™Р В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В¦Р В Р’В Р РЋРІР‚В Р В Р’В Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р СћРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р’В Р В РІР‚В  Р В Р’В Р вЂ™Р’В»Р В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р РЋР’ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў, Р В Р Р‹Р Р†Р вЂљР’В°Р В Р’В Р РЋРІР‚СћР В Р’В Р вЂ™Р’В± Р В Р’В Р СћРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р’В Р вЂ™Р’В·Р В Р Р‹Р Р†Р вЂљРІР‚Сљ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’Вµ Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р’В Р В РІР‚В Р В Р Р‹Р РЋРІР‚СљР В Р’В Р В РІР‚В Р В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚В
    RAISE EXCEPTION 'Р В Р’В Р Р†Р вЂљРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р вЂ™Р’В±Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂњР В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р’В Р РЋРІР‚Сћ Р В Р’В Р В РІР‚В¦Р В Р’В Р РЋРІР‚СћР В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В¦ Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р В РІР‚В . Р В Р’В Р РЋРЎСџР В Р’В Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В Р’В Р вЂ™Р’ВµР В Р’В Р РЋРІР‚СњР В Р’В Р вЂ™Р’В°Р В Р’В Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р Р†Р вЂљР’В¦Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚Сљ.';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.limit_daily_messages()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    SELECT count(*) 
    FROM messages 
    -- Р В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р вЂ™Р’ВР В Р’В Р РЋРЎСџР В Р’В Р вЂ™Р’В Р В Р’В Р РЋРІР‚в„ўР В Р’В Р Р†Р вЂљРІвЂћСћР В Р’В Р Р†Р вЂљРЎвЂќР В Р’В Р Р†Р вЂљРЎС›Р В Р’В Р РЋРЎС™Р В Р’В Р РЋРІР‚С”: Р В Р’В Р РЋР’ВР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎСљР В Р’В Р РЋР’ВР В Р’В Р РЋРІР‚Сћ user_id Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В° sender_id
    WHERE sender_id = NEW.sender_id 
    AND created_at > now() - interval '1 day'
  ) >= 1000 THEN
    RAISE EXCEPTION 'Daily limit reached (1000)';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.mark_chat_as_read(p_chat_id uuid, p_message_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.chats
    SET 
        user_last_read_id = CASE 
            WHEN user_id = p_user_id THEN p_message_id 
            ELSE user_last_read_id 
        END,
        recipient_last_read_id = CASE 
            WHEN recipient_id = p_user_id THEN p_message_id 
            ELSE recipient_last_read_id 
        END
    WHERE id = p_chat_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_create_chat(p_recipient_id uuid)
 RETURNS public.chats
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_chat public.chats;
begin
  perform public.check_action_limit('chat_create');

  insert into public.chats(user_id, recipient_id)
  values (auth.uid(), p_recipient_id)
  returning * into new_chat;

  return new_chat;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_delete_message(p_message_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.check_action_limit('message_delete');

  delete from public.messages
  where id = p_message_id
    and sender_id = auth.uid();

  return p_message_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_edit_message(p_message_id uuid, p_content text)
 RETURNS public.messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated_message public.messages;
begin
  perform public.check_action_limit('message_edit');

  update public.messages
  set content = p_content,
      updated_at = now()
  where id = p_message_id
    and sender_id = auth.uid()
  returning * into updated_message;

  if updated_message.id is null then
    raise exception 'Message not found or not owned' using errcode = 'P0001';
  end if;

  return updated_message;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_mark_chat_as_read(p_chat_id uuid, p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.chats;
  update_data record;
begin
  perform public.check_action_limit('chat_mark_read');

  select * into c from public.chats where id = p_chat_id;
  if c.id is null then
    raise exception 'Chat not found' using errcode = 'P0001';
  end if;

  if c.user_id = auth.uid() then
    update public.chats set user_last_read_id = p_message_id where id = p_chat_id;
  elsif c.recipient_id = auth.uid() then
    update public.chats set recipient_last_read_id = p_message_id where id = p_chat_id;
  else
    raise exception 'Not a participant' using errcode = '28000';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rpc_send_message(p_chat_id uuid, p_content text, p_reply_to_id uuid DEFAULT NULL::uuid, p_attachments jsonb DEFAULT '[]'::jsonb, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS public.messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_message public.messages;
begin
  perform public.check_action_limit('message_send');

  insert into public.messages(chat_id, sender_id, content, reply_to_id, attachments, client_id)
  values (p_chat_id, auth.uid(), p_content, p_reply_to_id, p_attachments, p_client_id)
  returning * into new_message;

  return new_message;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_offline()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.user
  SET last_seen = now()
  WHERE id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_last_seen()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE public.users 
    SET last_seen = now() 
    WHERE id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION ratelimit.check_limit(u_id uuid, target_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  is_allowed boolean;
begin
  insert into ratelimit.requests (user_id, endpoint)
  values (u_id, target_endpoint)
  on conflict (user_id, endpoint) do update
  set request_count = case 
    when ratelimit.requests.last_request < now() - interval '1 minute' then 1
    else ratelimit.requests.request_count + 1
  end,
  last_request = now();

  select (request_count <= 30) into is_allowed -- 30 Р В Р’В Р вЂ™Р’В·Р В Р’В Р вЂ™Р’В°Р В Р’В Р РЋРІР‚вЂќР В Р’В Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІР‚СљР В Р’В Р В РІР‚В  Р В Р’В Р В РІР‚В¦Р В Р’В Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљР’В¦Р В Р’В Р В РІР‚В Р В Р’В Р РЋРІР‚ВР В Р’В Р вЂ™Р’В»Р В Р’В Р РЋРІР‚ВР В Р’В Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚Сљ
  from ratelimit.requests
  where user_id = u_id and endpoint = target_endpoint;

  return is_allowed;
end;
$function$
;

grant delete on table "public"."chats" to "anon";

grant insert on table "public"."chats" to "anon";

grant references on table "public"."chats" to "anon";

grant select on table "public"."chats" to "anon";

grant trigger on table "public"."chats" to "anon";

grant truncate on table "public"."chats" to "anon";

grant update on table "public"."chats" to "anon";

grant delete on table "public"."chats" to "authenticated";

grant insert on table "public"."chats" to "authenticated";

grant references on table "public"."chats" to "authenticated";

grant select on table "public"."chats" to "authenticated";

grant trigger on table "public"."chats" to "authenticated";

grant truncate on table "public"."chats" to "authenticated";

grant update on table "public"."chats" to "authenticated";

grant delete on table "public"."chats" to "service_role";

grant insert on table "public"."chats" to "service_role";

grant references on table "public"."chats" to "service_role";

grant select on table "public"."chats" to "service_role";

grant trigger on table "public"."chats" to "service_role";

grant truncate on table "public"."chats" to "service_role";

grant update on table "public"."chats" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."rate_limit_config" to "anon";

grant insert on table "public"."rate_limit_config" to "anon";

grant references on table "public"."rate_limit_config" to "anon";

grant select on table "public"."rate_limit_config" to "anon";

grant trigger on table "public"."rate_limit_config" to "anon";

grant truncate on table "public"."rate_limit_config" to "anon";

grant update on table "public"."rate_limit_config" to "anon";

grant delete on table "public"."rate_limit_config" to "authenticated";

grant insert on table "public"."rate_limit_config" to "authenticated";

grant references on table "public"."rate_limit_config" to "authenticated";

grant select on table "public"."rate_limit_config" to "authenticated";

grant trigger on table "public"."rate_limit_config" to "authenticated";

grant truncate on table "public"."rate_limit_config" to "authenticated";

grant update on table "public"."rate_limit_config" to "authenticated";

grant delete on table "public"."rate_limit_config" to "service_role";

grant insert on table "public"."rate_limit_config" to "service_role";

grant references on table "public"."rate_limit_config" to "service_role";

grant select on table "public"."rate_limit_config" to "service_role";

grant trigger on table "public"."rate_limit_config" to "service_role";

grant truncate on table "public"."rate_limit_config" to "service_role";

grant update on table "public"."rate_limit_config" to "service_role";

grant delete on table "public"."rate_limits" to "service_role";

grant insert on table "public"."rate_limits" to "service_role";

grant references on table "public"."rate_limits" to "service_role";

grant select on table "public"."rate_limits" to "service_role";

grant trigger on table "public"."rate_limits" to "service_role";

grant truncate on table "public"."rate_limits" to "service_role";

grant update on table "public"."rate_limits" to "service_role";

grant delete on table "public"."upload_audit" to "anon";

grant insert on table "public"."upload_audit" to "anon";

grant references on table "public"."upload_audit" to "anon";

grant select on table "public"."upload_audit" to "anon";

grant trigger on table "public"."upload_audit" to "anon";

grant truncate on table "public"."upload_audit" to "anon";

grant update on table "public"."upload_audit" to "anon";

grant delete on table "public"."upload_audit" to "authenticated";

grant insert on table "public"."upload_audit" to "authenticated";

grant references on table "public"."upload_audit" to "authenticated";

grant select on table "public"."upload_audit" to "authenticated";

grant trigger on table "public"."upload_audit" to "authenticated";

grant truncate on table "public"."upload_audit" to "authenticated";

grant update on table "public"."upload_audit" to "authenticated";

grant delete on table "public"."upload_audit" to "service_role";

grant insert on table "public"."upload_audit" to "service_role";

grant references on table "public"."upload_audit" to "service_role";

grant select on table "public"."upload_audit" to "service_role";

grant trigger on table "public"."upload_audit" to "service_role";

grant truncate on table "public"."upload_audit" to "service_role";

grant update on table "public"."upload_audit" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "Allow members full access to their chats"
  on "public"."chats"
  as permissive
  for all
  to authenticated
using (((auth.uid() = user_id) OR (auth.uid() = recipient_id)))
with check (((auth.uid() = user_id) OR (auth.uid() = recipient_id)));



  create policy "Users can create chats"
  on "public"."chats"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) AND (user_id <> recipient_id) AND (recipient_id IN ( SELECT users.id
   FROM public.users))));



  create policy "Users can delete own chats"
  on "public"."chats"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) OR (auth.uid() = recipient_id)));



  create policy "Users can delete their own chats"
  on "public"."chats"
  as permissive
  for delete
  to authenticated
using (((auth.uid() = user_id) OR (auth.uid() = recipient_id)));



  create policy "Users can insert their own chats"
  on "public"."chats"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "Users can update own chats"
  on "public"."chats"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR (auth.uid() = recipient_id)))
with check (((auth.uid() = user_id) OR (auth.uid() = recipient_id)));



  create policy "Users can view own chats"
  on "public"."chats"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR (auth.uid() = recipient_id)));



  create policy "Users can view their own chats"
  on "public"."chats"
  as permissive
  for select
  to authenticated
using (((auth.uid() = user_id) OR (auth.uid() = recipient_id)));



  create policy "Allow update for owners"
  on "public"."messages"
  as permissive
  for update
  to authenticated
using ((auth.uid() = sender_id))
with check ((auth.uid() = sender_id));



  create policy "Users can delete own messages"
  on "public"."messages"
  as permissive
  for delete
  to public
using ((auth.uid() = sender_id));



  create policy "Users can delete their own messages"
  on "public"."messages"
  as permissive
  for delete
  to public
using (((sender_id)::text = (auth.uid())::text));



  create policy "Users can edit own messages"
  on "public"."messages"
  as permissive
  for update
  to public
using ((auth.uid() = sender_id))
with check ((auth.uid() = sender_id));



  create policy "Users can insert messages in their chats"
  on "public"."messages"
  as permissive
  for insert
  to authenticated
with check (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.chats
  WHERE ((chats.id = messages.chat_id) AND ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid())))))));



  create policy "Users can send messages"
  on "public"."messages"
  as permissive
  for insert
  to public
with check (((auth.uid() = sender_id) AND (chat_id IN ( SELECT chats.id
   FROM public.chats
  WHERE ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid()))))));



  create policy "Users can view chat messages"
  on "public"."messages"
  as permissive
  for select
  to public
using ((chat_id IN ( SELECT chats.id
   FROM public.chats
  WHERE ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid())))));



  create policy "Users can view messages in their chats"
  on "public"."messages"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.chats
  WHERE ((chats.id = messages.chat_id) AND ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid()))))));



  create policy "Users can insert own profile"
  on "public"."users"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "Users can update own profile"
  on "public"."users"
  as permissive
  for update
  to public
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "Users can view all contacts"
  on "public"."users"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Users can view own profile"
  on "public"."users"
  as permissive
  for select
  to public
using ((auth.uid() = id));


CREATE TRIGGER chats_rate_limit_delete BEFORE DELETE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.enforce_chats_rate_limit();

CREATE TRIGGER chats_rate_limit_insert BEFORE INSERT ON public.chats FOR EACH ROW EXECUTE FUNCTION public.enforce_chats_rate_limit();

CREATE TRIGGER chats_rate_limit_update BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.enforce_chats_rate_limit();

CREATE TRIGGER messages_rate_limit_delete BEFORE DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_rate_limit();

CREATE TRIGGER messages_rate_limit_insert BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_rate_limit();

CREATE TRIGGER messages_rate_limit_update BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enforce_messages_rate_limit();

CREATE TRIGGER set_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.handle_message_update();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_user_delete();


  create policy "Allow bucket config read"
  on "storage"."buckets"
  as permissive
  for select
  to public
using (((auth.role() = 'authenticated'::text) AND (name = 'attachments'::text)));



  create policy "Participants can upload chat attachments"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'attachments'::text) AND (auth.role() = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM public.chats c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_id = auth.uid()) OR (c.recipient_id = auth.uid())))))));



  create policy "Participants can view chat attachments"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'attachments'::text) AND (EXISTS ( SELECT 1
   FROM public.chats
  WHERE (((chats.id)::text = (storage.foldername(objects.name))[1]) AND ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid())))))));



  create policy "Temp Allow Upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'attachments'::text));



  create policy "Users can delete own attachments"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text) AND public.check_action_limit('storage_delete'::text)));



  create policy "Users can delete own chat attachments"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'attachments'::text) AND (owner = auth.uid())));



  create policy "Users can update own attachments"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)))
with check (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));



  create policy "Users can upload attachments"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT chats.id
   FROM public.chats
  WHERE ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid())))) AND public.check_action_limit('storage_upload'::text)));



  create policy "Users can view chat attachments"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'attachments'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT chats.id
   FROM public.chats
  WHERE ((chats.user_id = auth.uid()) OR (chats.recipient_id = auth.uid()))))));


CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER tr_check_upload_rate_limit BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION public.check_upload_rate_limit();


