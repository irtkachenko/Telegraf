import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const siteUrl = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000'

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured')
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Configure web-push
    webpush.setVapidDetails(
      `mailto:admin@${new URL(siteUrl).hostname}`,
      vapidPublicKey,
      vapidPrivateKey
    )

    // Parse request body
    const { messageId, chatId, senderId, content, chatName } = await req.json()

    if (!messageId || !chatId || !senderId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: messageId, chatId, senderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get chat details to find recipient
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('user_id, recipient_id')
      .eq('id', chatId)
      .single()

    if (chatError || !chat) {
      console.error('Chat not found:', chatError)
      return new Response(
        JSON.stringify({ error: 'Chat not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine recipient (the one who is NOT the sender)
    const recipientId = chat.user_id === senderId ? chat.recipient_id : chat.user_id

    if (!recipientId) {
      console.log('No recipient found (maybe group chat or deleted user)')
      return new Response(
        JSON.stringify({ success: true, message: 'No recipient to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Don't send notification to the sender
    if (recipientId === senderId) {
      return new Response(
        JSON.stringify({ success: true, message: 'Sender is also recipient, skipping' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get recipient's push subscription
    const { data: subscriptionRow, error: subError } = await supabase
      .from('user_push_subscriptions')
      .select('subscription')
      .eq('user_id', recipientId)
      .maybeSingle()

    if (subError) {
      console.error('Error fetching subscription:', subError)
    }

    if (!subscriptionRow) {
      console.log('No push subscription found for user:', recipientId)
      return new Response(
        JSON.stringify({ success: true, message: 'No subscription found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const subscription = subscriptionRow.subscription as {
      endpoint: string
      expirationTime: number | null
      keys: { p256dh: string; auth: string }
    }

    // Get sender's info for notification
    const { data: sender, error: senderError } = await supabase
      .from('users')
      .select('name')
      .eq('id', senderId)
      .single()

    const senderName = sender?.name || 'Користувач'

    // Create short notification text (first 100 chars)
    const shortContent = content.length > 100 ? content.substring(0, 97) + '...' : content

    // Prepare notification payload
    const notificationPayload = JSON.stringify({
      title: `${senderName}`,
      body: shortContent || 'Нове повідомлення',
      url: `/chat/${chatId}`,
    })

    // Send push notification
    try {
      await webpush.sendNotification(subscription, notificationPayload)
      console.log(`Push notification sent to user ${recipientId} for message ${messageId}`)
    } catch (pushError) {
      // If subscription is invalid, remove it
      if (pushError instanceof Error && 'statusCode' in pushError) {
        const statusCode = (pushError as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          console.log('Removing invalid subscription for user:', recipientId)
          await supabase
            .from('user_push_subscriptions')
            .delete()
            .eq('user_id', recipientId)
        }
      }
      console.error('Push send failed:', pushError)
      // Don't fail the request, just log the error
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})