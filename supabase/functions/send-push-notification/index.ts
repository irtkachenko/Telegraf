// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Resolve the service-role (admin) key.
// Supports the new `SUPABASE_SECRET_KEYS` (JSON: name -> sb_secret_...) format
// with a fallback to the legacy `SUPABASE_SERVICE_ROLE_KEY` env var.
function getServiceRoleKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeys) {
    try {
      const keys = JSON.parse(secretKeys)
      if (keys && typeof keys === 'object') {
        if (typeof keys.default === 'string' && keys.default) return keys.default
        const first = Object.values(keys).find((v) => typeof v === 'string' && v.length > 0)
        if (first) return first
      }
    } catch {
      // ignore malformed JSON, fall back below
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

// Extract the `role` claim from a JWT payload string.
//
// SECURITY: This helper is NOT itself a signature check. The cryptographic
// validation of the JWT is performed by the Supabase platform because the
// function runs with `verify_jwt = true` (see supabase/config.toml); any token
// with an invalid/forged signature is rejected with 401 before this handler
// executes. We only inspect the already-validated `role` claim here to make
// sure a *signed-in user* JWT (role `authenticated`) can never trigger the
// function — only a genuine service_role caller (the Database Webhook) may.
function getRoleFromToken(token) {
  if (!token) return null
  const part = token.split('.')[1]
  if (!part) return null
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    )
    const parsed = JSON.parse(json)
    return parsed && typeof parsed.role === 'string' ? parsed.role : null
  } catch {
    return null
  }
}

// Determine whether the caller presents a `service_role` token.
//
// Preferred source: `x-supabase-auth`, the platform-injected header carrying
// the verifiably-signed JWT claims when `verify_jwt = true` is set. We fall
// back to the `Authorization` header, whose signature is likewise validated by
// the platform under `verify_jwt = true`. Either way the signature check is the
// platform's job — we only assert the caller role.
function isServiceRoleCaller(req) {
  const sbAuth = req.headers.get('x-supabase-auth')
  if (sbAuth) {
    try {
      const parsed = JSON.parse(sbAuth)
      if (parsed && parsed.role === 'service_role') return true
    } catch {
      // malformed injected header — fall through to Authorization below
    }
  }
  const auth = req.headers.get('authorization') || ''
  return getRoleFromToken(auth.replace(/^Bearer\s+/i, '').trim()) === 'service_role'
}

// TTL: 1 hour — enough for a messaging app. If the device is offline,
// the push will be delivered when it comes back online within the hour.
const PUSH_TTL = 3600

// Max retries for transient errors (5xx)
const MAX_RETRIES = 1

function isValidSubscription(sub) {
  return (
    sub &&
    typeof sub.endpoint === 'string' &&
    sub.endpoint.length > 0 &&
    sub.keys &&
    typeof sub.keys.p256dh === 'string' &&
    typeof sub.keys.auth === 'string'
  )
}

async function sendWithRetry(subscription, payload, options) {
  let lastError = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await webpush.sendNotification(subscription, payload, options)
      return { ok: true }
    } catch (err) {
      lastError = err
      const status = err?.statusCode
      // 404 = endpoint not found, 410 = subscription expired, 403 = VAPID mismatch
      if (status === 404 || status === 410 || status === 403) {
        return { ok: false, status, fatal: true }
      }
      // Transient errors (5xx, network) — retry once
      if (attempt < MAX_RETRIES && (status >= 500 || !status)) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      return { ok: false, status, fatal: false }
    }
  }
  return { ok: false, error: lastError }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only accept calls authenticated with a service_role token
    // (i.e. coming from a Supabase Database Webhook). The cryptographic JWT
    // signature is validated by the platform (`verify_jwt = true` in
    // supabase/config.toml) before this handler runs — here we additionally
    // assert that the caller's verified role is `service_role`, so a regular
    // signed-in user's token can never trigger the function.
    if (!isServiceRoleCaller(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
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

    // ── Parse payload (supports both Database Webhook and legacy direct POST) ──
    const body = await req.json()

    // Database Webhook format:
    // {
    //   type: "INSERT", table: "messages", schema: "public",
    //   record: { id, chat_id, sender_id, content, ... },
    //   old_record: null
    // }
    const isWebhook = body && body.type === 'INSERT' && body.record

    const messageId = isWebhook ? body.record.id : body.messageId
    const chatId = isWebhook ? body.record.chat_id : body.chatId
    const senderId = isWebhook ? body.record.sender_id : body.senderId
    const content = isWebhook ? body.record.content : body.content

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
    console.log(`[PUSH DEBUG] chatId=${chatId} senderId=${senderId} recipientId=${recipientId}`)
    if (!recipientId || recipientId === senderId) {
      return new Response(JSON.stringify({ success: true, message: 'Skipped' }), { headers: corsHeaders })
    }

    const { data: subscriptionRows } = await supabase
      .from('user_push_subscriptions')
      .select('id, subscription, user_id')
      .eq('user_id', recipientId)

    console.log(`[PUSH DEBUG] subscriptionRows for recipientId=${recipientId}: count=${subscriptionRows?.length ?? 0}`)

    if (!subscriptionRows || subscriptionRows.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No subscription' }), { headers: corsHeaders })
    }

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
        //'Topic': `chat-${chatId}`, Групує пуші на рівні сервера FCM/GCM
        'Topic': `msg-${messageId}`
      },
      TTL: PUSH_TTL,
    }

    const sendPromises = subscriptionRows.map(async (row) => {
      // Validate subscription format before sending
      if (!isValidSubscription(row.subscription)) {
        console.warn(`[PUSH] Invalid subscription format for sub id=${row.id}, removing`)
        await supabase.from('user_push_subscriptions').delete().eq('id', row.id)
        return
      }

      const result = await sendWithRetry(row.subscription, notificationPayload, pushOptions)

      if (result.ok) {
        console.log(`Push sent to ${recipientId} (sub id=${row.id})`)
      } else if (result.fatal) {
        // 404/410/403 — subscription is dead, remove it
        console.log(`Removing stale push subscription id=${row.id} for ${recipientId} (HTTP ${result.status})`)
        await supabase.from('user_push_subscriptions').delete().eq('id', row.id)
      } else {
        console.error(`Push error for sub id=${row.id}:`, result.error)
      }
    })

    await Promise.allSettled(sendPromises)

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
  }
})