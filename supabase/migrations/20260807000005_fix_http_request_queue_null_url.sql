-- Fix error: null value in column "url" of relation "http_request_queue" violates not-null constraint
-- 
-- Root cause: The send_push_notification() trigger uses:
--   current_setting('app.supabase_url', true)
--   current_setting('app.service_role_key', true)
-- 
-- These custom GUC settings are NOT configured in the database, so they return NULL.
-- Then NULL || '/functions/v1/send-push-notification' = NULL,
-- which violates the NOT NULL constraint on http_request_queue.url in pg_net.
-- 
-- Fix: Recreate the function with hardcoded fallback values so it never passes NULL.

-- Recreate the function with a defensive fallback for the URL
-- so it never passes NULL to net.http_post
CREATE OR REPLACE FUNCTION public.send_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recipient_id UUID;
  sender_name TEXT;
  chat_record RECORD;
  payload JSONB;
  v_supabase_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Only process if this is a new message (not an update)
  IF TG_OP = 'INSERT' THEN
    -- Get chat info to find recipient
    SELECT 
      c.user_id, 
      c.recipient_id 
    INTO chat_record
    FROM public.chats AS c
    WHERE c.id = NEW.chat_id;
    
    -- Determine recipient (the one who is NOT the sender)
    IF chat_record.user_id = NEW.sender_id THEN
      v_recipient_id := chat_record.recipient_id;
    ELSE
      v_recipient_id := chat_record.user_id;
    END IF;
    
    -- Skip if no recipient or recipient is the sender
    IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
      RETURN NEW;
    END IF;
    
    -- Get sender name (users table has 'name' column, not 'full_name' or 'username')
    SELECT 
      COALESCE(u.name, 'Користувач') 
    INTO sender_name
    FROM public.users AS u
    WHERE u.id = NEW.sender_id;
    
    -- Prepare payload for Edge Function
    payload := jsonb_build_object(
      'messageId', NEW.id,
      'chatId', NEW.chat_id,
      'senderId', NEW.sender_id,
      'content', NEW.content,
      'chatName', 'Чат'
    );
    
    -- Get Supabase URL and service role key with hardcoded fallback
    v_supabase_url := COALESCE(
      current_setting('app.supabase_url', true),
      'https://qdvtruuujxmjmmtbsizq.supabase.co'
    );
    v_service_role_key := COALESCE(
      current_setting('app.service_role_key', true),
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdnRydXV1anhtam1tdGJzaXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTE2Mzg5NywiZXhwIjoyMDg0NzM5ODk3fQ.4Zi2WvwMjxx-1Kh6haKGs74M1HCWtWWeWQBXuOtb5BM'
    );
    
    -- Call Edge Function asynchronously (don't block the transaction)
    -- net.http_post expects body => jsonb (NOT text)
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body := payload
    );
    
    -- Log the attempt (optional, for debugging)
    RAISE LOG 'Push notification triggered for message % to user %', NEW.id, v_recipient_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger (it will automatically use the updated function)
DROP TRIGGER IF EXISTS on_message_insert ON public.messages;
CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_notification();

-- Grant execute permission on net.http_post to service_role
GRANT EXECUTE ON FUNCTION net.http_post TO postgres, service_role, anon, authenticated;

-- Comment
COMMENT ON FUNCTION send_push_notification() IS 'Triggers push notification via Edge Function when a new message is inserted';
COMMENT ON TRIGGER on_message_insert ON messages IS 'Sends push notification to recipient when a new message arrives';