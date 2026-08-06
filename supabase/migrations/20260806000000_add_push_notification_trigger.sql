-- Увімкнення розширення pg_net для асинхронних HTTP-запитів
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Надання прав на схему net
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;

-- Створення функції тригера для відправки пуш-сповіщень
CREATE OR REPLACE FUNCTION public.send_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recipient_id UUID;
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
      recipient_id := chat_record.recipient_id;
    ELSE
      recipient_id := chat_record.user_id;
    END IF;
    
    -- Skip if no recipient or recipient is the sender
    IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN
      RETURN NEW;
    END IF;
    
    -- Get sender name
    SELECT 
      COALESCE(u.full_name, u.username, 'Користувач') 
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
    -- Using pg_net to make HTTP request
    PERFORM extensions.net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := payload::text
    );
    
    -- Log the attempt (optional, for debugging)
    RAISE LOG 'Push notification triggered for message % to user %', NEW.id, recipient_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on messages table
DROP TRIGGER IF EXISTS on_message_insert ON public.messages;
CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_notification();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION extensions.net.http_post TO postgres, service_role;

-- Create a comment explaining the trigger
COMMENT ON FUNCTION send_push_notification() IS 'Triggers push notification via Edge Function when a new message is inserted';
COMMENT ON TRIGGER on_message_insert ON messages IS 'Sends push notification to recipient when a new message arrives';