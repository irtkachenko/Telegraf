// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const siteUrl = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000'

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: 'VAPID keys missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    webpush.setVapidDetails(
      `mailto:admin@${new URL(siteUrl).hostname}`,
      vapidPublicKey,
      vapidPrivateKey
    )

    const { messageId, chatId, senderId, content } = await req.json()

    if (!messageId || !chatId || !senderId) {
      return new Response(
        JSON.stringify({ error: 'Missing fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: chat } = await supabase
      .from('chats')
      .select('user_id, recipient_id')
      .eq('id', chatId)
      .single()

    if (!chat) {
      return new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404, headers: corsHeaders })
    }

    const recipientId = chat.user_id === senderId ? chat.recipient_id : chat.user_id
    if (!recipientId || recipientId === senderId) {
      return new Response(JSON.stringify({ success: true, message: 'Skipped' }), { headers: corsHeaders })
    }

    const { data: subscriptionRow } = await supabase
      .from('user_push_subscriptions')
      .select('subscription')
      .eq('user_id', recipientId)
      .maybeSingle()

    if (!subscriptionRow) {
      return new Response(JSON.stringify({ success: true, message: 'No subscription' }), { headers: corsHeaders })
    }

    const subscription = subscriptionRow.subscription

    const { data: sender } = await supabase
      .from('users')
      .select('name')
      .eq('id', senderId)
      .single()

    const senderName = sender?.name || 'Користувач'
    const shortContent = content ? (content.length > 100 ? content.substring(0, 97) + '...' : content) : 'Нове повідомлення'

    // Count total unread MESSAGES across ALL chats for this recipient
    // This ensures the badge shows the exact number of unread messages
    let badgeCount = 1
    try {
      const { data: recipientChats } = await supabase
        .from('chats')
        .select('id, user_id, recipient_id, user_last_read_id, recipient_last_read_id')
        .or(`user_id.eq.${recipientId},recipient_id.eq.${recipientId}`)

      if (recipientChats && recipientChats.length > 0) {
        let totalUnreadMessages = 0

        for (const c of recipientChats) {
          const isUser = c.user_id === recipientId
          const lastReadId = isUser ? c.user_last_read_id : c.recipient_last_read_id

          let query = supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('chat_id', c.id)
            .neq('sender_id', recipientId)

          if (lastReadId) {
            const { data: readMsg } = await supabase
              .from('messages')
              .select('created_at')
              .eq('id', lastReadId)
              .single()

            if (readMsg?.created_at) {
              query = query.gt('created_at', readMsg.created_at)
            }
          }

          const { count: unreadCount } = await query

          if (typeof unreadCount === 'number') {
            totalUnreadMessages += unreadCount
          }
        }

        if (totalUnreadMessages > 0) {
          badgeCount = totalUnreadMessages
        }
      }
    } catch {
      // Fallback to 1 if calculation fails
    }

    const notificationPayload = JSON.stringify({
      title: senderName,
      body: shortContent,
      url: `/chat/${chatId}`,
      chatId: chatId,
      messageId: messageId,
      badgeCount: badgeCount,
    })

    // Опції відправки для високого пріоритету
    const pushOptions = {
      headers: {
        'Urgency': 'high',
        'Topic': `chat-${chatId}` // Групує пуші на рівні сервера FCM/GCM
      },
      TTL: 86400,
    }

    try {
      await webpush.sendNotification(subscription, notificationPayload, pushOptions)
      console.log(`Push sent to ${recipientId}`)
    } catch (pushError: any) {
      const status = pushError?.statusCode
      // 404 = endpoint not found, 410 = subscription expired, 403 = VAPID mismatch
      if (status === 404 || status === 410 || status === 403) {
        console.log(`Removing stale push subscription for ${recipientId} (HTTP ${status})`)
        await supabase.from('user_push_subscriptions').delete().eq('user_id', recipientId)
      } else {
        console.error('Push error:', pushError)
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }
})