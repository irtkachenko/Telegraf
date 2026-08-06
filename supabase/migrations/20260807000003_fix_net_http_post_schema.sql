-- Fix cross-database reference error: extensions.net.http_post is invalid
-- pg_net extension provides net.http_post, not extensions.net.http_post
-- Using extensions.net.http_post causes: "cross-database references are not implemented"

-- Grant usage on net schema (pg_net extension schema)
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;

-- Recreate send_push_notification with correct net.http_post call
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
    
    -- Call Edge Function asynchronously (don't block the transaction)
    -- Using net.http_post (pg_net extension) - NOT extensions.net.http_post
    PERFORM net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := payload::text
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