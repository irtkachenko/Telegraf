


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "drizzle";


ALTER SCHEMA "drizzle" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_action_limit"("p_action" "text", "p_max_count" integer DEFAULT NULL::integer, "p_seconds" integer DEFAULT NULL::integer, "p_u_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  $$;


ALTER FUNCTION "public"."check_action_limit"("p_action" "text", "p_max_count" integer, "p_seconds" integer, "p_u_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_rate_limits"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    delete from public.rate_limits
    where window_start < now() - interval '24 hours';
end;
$$;


ALTER FUNCTION "public"."cleanup_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_expired_assets"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Delete metadata from Supabase Storage
  -- The underlying files are usually cleaned up by Supabase's internal processes
  delete from storage.objects
  where created_at < now() - interval '24 hours'
    and bucket_id = 'attachments';
end;
$$;


ALTER FUNCTION "public"."delete_expired_assets"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_expired_assets"() IS 'Deletes storage objects older than 24h from attachments bucket.';



CREATE OR REPLACE FUNCTION "public"."enforce_chats_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."enforce_chats_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_messages_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."enforce_messages_rate_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_message_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Перевіряємо, чи змінився контент (щоб не ставити дату просто так)
    IF NEW.content IS DISTINCT FROM OLD.content THEN
        NEW.updated_at = NOW();
    ELSE
        -- Якщо контент не мінявся, залишаємо старе значення updated_at
        NEW.updated_at = OLD.updated_at;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_message_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, name, image)
  VALUES (
    new.id::text,
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.users WHERE id = old.id::text;
  RETURN old;
END;
$$;


ALTER FUNCTION "public"."handle_user_delete"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "recipient_id" "uuid",
    "title" "text" DEFAULT 'New Chat'::"text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "user_last_read_id" "uuid",
    "recipient_last_read_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."chats" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_create_chat"("p_recipient_id" "uuid") RETURNS "public"."chats"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    new_chat public.chats;
begin
    if p_recipient_id = auth.uid() then
        raise exception 'Bad Request: Cannot create a chat with yourself' using errcode = 'P0001';
    end if;

    if not exists (select 1 from public.users where id = p_recipient_id) then
        raise exception 'Not Found: Recipient user does not exist' using errcode = 'P0001';
    end if;

    insert into public.chats(user_id, recipient_id, title)
    values (auth.uid(), p_recipient_id, 'Chat')
    returning * into new_chat;

    return new_chat;
end;
$$;


ALTER FUNCTION "public"."rpc_create_chat"("p_recipient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_delete_message"("p_message_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    delete from public.messages
    where id = p_message_id
      and sender_id = auth.uid();

    return p_message_id;
end;
$$;


ALTER FUNCTION "public"."rpc_delete_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text",
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reply_to_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "client_id" "uuid",
    CONSTRAINT "content_length_check" CHECK (("char_length"("content") <= 3000))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_edit_message"("p_message_id" "uuid", "p_content" "text") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    updated_message public.messages;
begin
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
$$;


ALTER FUNCTION "public"."rpc_edit_message"("p_message_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_mark_chat_as_read"("p_chat_id" "uuid", "p_message_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
    c public.chats;
begin
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
$$;


ALTER FUNCTION "public"."rpc_mark_chat_as_read"("p_chat_id" "uuid", "p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_send_message"("p_chat_id" "uuid", "p_content" "text", "p_reply_to_id" "uuid" DEFAULT NULL::"uuid", "p_attachments" "jsonb" DEFAULT '[]'::"jsonb", "p_client_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

    insert into public.messages(chat_id, sender_id, content, reply_to_id, attachments, client_id)
    values (p_chat_id, auth.uid(), p_content, p_reply_to_id, p_attachments, p_client_id)
    returning * into new_message;

    return new_message;
end;
$$;


ALTER FUNCTION "public"."rpc_send_message"("p_chat_id" "uuid", "p_content" "text", "p_reply_to_id" "uuid", "p_attachments" "jsonb", "p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_users"("p_query" "text") RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "image" "text", "last_seen" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only allow searches with proper query length
  IF length(trim(p_query)) < 2 THEN
    RETURN;
  END IF;
  
  -- Return query result - EMAIL SEARCH ONLY
  RETURN QUERY
  SELECT 
    u.id,
    u.name,
    u.email,
    u.image,
    u.last_seen
  FROM public.users u
  WHERE 
    u.id != auth.uid()
    AND u.email ILIKE '%' || trim(p_query) || '%'  -- EMAIL ONLY
  LIMIT 10;
END;
$$;


ALTER FUNCTION "public"."search_users"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_seen"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
    update public.users
    set last_seen = now(),
        is_online = true,
        status = 'online'
    where id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."update_last_seen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
    "id" integer NOT NULL,
    "hash" "text" NOT NULL,
    "created_at" bigint
);


ALTER TABLE "drizzle"."__drizzle_migrations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "drizzle"."__drizzle_migrations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "drizzle"."__drizzle_migrations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "drizzle"."__drizzle_migrations_id_seq" OWNED BY "drizzle"."__drizzle_migrations"."id";



CREATE TABLE IF NOT EXISTS "public"."rate_limit_config" (
    "action" "text" NOT NULL,
    "max_count" integer NOT NULL,
    "window_seconds" integer NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."rate_limit_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "window_seconds" integer NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text" NOT NULL,
    "emailVerified" timestamp without time zone,
    "image" "text",
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "is_online" boolean DEFAULT false,
    "status" "text" DEFAULT 'offline'::"text",
    "status_message" "text",
    "provider" "text",
    "provider_id" "text",
    "preferences" "jsonb",
    "theme" "text" DEFAULT 'system'::"text",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "drizzle"."__drizzle_migrations" ALTER COLUMN "id" SET DEFAULT "nextval"('"drizzle"."__drizzle_migrations_id_seq"'::"regclass");



ALTER TABLE ONLY "drizzle"."__drizzle_migrations"
    ADD CONSTRAINT "__drizzle_migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_config"
    ADD CONSTRAINT "rate_limit_config_pkey" PRIMARY KEY ("action");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("user_id", "action", "window_seconds", "window_start");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "user_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_chats_last_message" ON "public"."chats" USING "btree" ("user_id", "recipient_id", "id");



CREATE INDEX "idx_chats_updated_at" ON "public"."chats" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_chats_users" ON "public"."chats" USING "btree" ("user_id", "recipient_id");



CREATE INDEX "idx_messages_chat_created" ON "public"."messages" USING "btree" ("chat_id", "created_at" DESC);



CREATE INDEX "idx_messages_chat_id" ON "public"."messages" USING "btree" ("chat_id");



CREATE INDEX "idx_messages_client_id" ON "public"."messages" USING "btree" ("client_id");



CREATE INDEX "idx_user_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_user_last_seen" ON "public"."users" USING "btree" ("last_seen");



CREATE INDEX "idx_user_provider" ON "public"."users" USING "btree" ("provider", "provider_id");



CREATE OR REPLACE TRIGGER "chats_rate_limit_delete" BEFORE DELETE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chats_rate_limit"();



CREATE OR REPLACE TRIGGER "chats_rate_limit_insert" BEFORE INSERT ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chats_rate_limit"();



CREATE OR REPLACE TRIGGER "chats_rate_limit_update" BEFORE UPDATE ON "public"."chats" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_chats_rate_limit"();



CREATE OR REPLACE TRIGGER "messages_rate_limit_delete" BEFORE DELETE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_messages_rate_limit"();



CREATE OR REPLACE TRIGGER "messages_rate_limit_insert" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_messages_rate_limit"();



CREATE OR REPLACE TRIGGER "messages_rate_limit_update" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_messages_rate_limit"();



CREATE OR REPLACE TRIGGER "set_messages_updated_at" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."handle_message_update"();



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_recipient_last_read_id_fkey" FOREIGN KEY ("recipient_last_read_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_last_read_id_fkey" FOREIGN KEY ("user_last_read_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_messages_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow members full access to their chats" ON "public"."chats" TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can create chats" ON "public"."chats" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("user_id" <> "recipient_id") AND ("recipient_id" IN ( SELECT "users"."id"
   FROM "public"."users"))));



CREATE POLICY "Users can delete own chats" ON "public"."chats" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can delete own messages" ON "public"."messages" FOR DELETE USING (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can edit own messages" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "sender_id")) WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can send messages" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND ("chat_id" IN ( SELECT "chats"."id"
   FROM "public"."chats"
  WHERE (("chats"."user_id" = "auth"."uid"()) OR ("chats"."recipient_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update own chats" ON "public"."chats" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_id"))) WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view chat messages" ON "public"."messages" FOR SELECT USING (("chat_id" IN ( SELECT "chats"."id"
   FROM "public"."chats"
  WHERE (("chats"."user_id" = "auth"."uid"()) OR ("chats"."recipient_id" = "auth"."uid"())))));



CREATE POLICY "Users can view chat participants" ON "public"."users" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."chats" "c"
  WHERE ((("c"."user_id" = "auth"."uid"()) OR ("c"."recipient_id" = "auth"."uid"())) AND (("c"."user_id" = "users"."id") OR ("c"."recipient_id" = "users"."id"))))));



CREATE POLICY "Users can view message senders" ON "public"."users" FOR SELECT TO "authenticated" USING ((("id" IN ( SELECT DISTINCT "messages"."sender_id"
   FROM "public"."messages"
  WHERE ("messages"."chat_id" IN ( SELECT "chats"."id"
           FROM "public"."chats"
          WHERE (("chats"."user_id" = "auth"."uid"()) OR ("chats"."recipient_id" = "auth"."uid"())))))) OR ("id" = "auth"."uid"())));



CREATE POLICY "Users can view own chats" ON "public"."chats" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chats";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."check_action_limit"("p_action" "text", "p_max_count" integer, "p_seconds" integer, "p_u_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_action_limit"("p_action" "text", "p_max_count" integer, "p_seconds" integer, "p_u_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_action_limit"("p_action" "text", "p_max_count" integer, "p_seconds" integer, "p_u_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_expired_assets"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_expired_assets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_expired_assets"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_chats_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_chats_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_chats_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_messages_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_messages_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_messages_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_message_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_message_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_message_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_delete"() TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_create_chat"("p_recipient_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_create_chat"("p_recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_create_chat"("p_recipient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_delete_message"("p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_delete_message"("p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_delete_message"("p_message_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_edit_message"("p_message_id" "uuid", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_edit_message"("p_message_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_edit_message"("p_message_id" "uuid", "p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_mark_chat_as_read"("p_chat_id" "uuid", "p_message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_mark_chat_as_read"("p_chat_id" "uuid", "p_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_mark_chat_as_read"("p_chat_id" "uuid", "p_message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_send_message"("p_chat_id" "uuid", "p_content" "text", "p_reply_to_id" "uuid", "p_attachments" "jsonb", "p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_send_message"("p_chat_id" "uuid", "p_content" "text", "p_reply_to_id" "uuid", "p_attachments" "jsonb", "p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_send_message"("p_chat_id" "uuid", "p_content" "text", "p_reply_to_id" "uuid", "p_attachments" "jsonb", "p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_users"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_users"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_users"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_seen"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_seen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_seen"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."rate_limit_config" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































