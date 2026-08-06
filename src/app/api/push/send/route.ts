import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, payload } = body as { userId?: string; payload?: PushPayload };

    if (!userId || !payload?.title || !payload?.body) {
      return NextResponse.json(
        { error: 'userId, payload.title and payload.body are required' },
        { status: 400 },
      );
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json(
        { error: 'VAPID keys are not configured' },
        { status: 500 },
      );
    }

    webpush.setVapidDetails(`mailto:admin@${new URL(siteUrl).hostname}`, vapidPublicKey, vapidPrivateKey);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
        { status: 500 },
      );
    }

    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

    const { data: subscriptionRow, error: fetchError } = await adminClient
      .from('user_push_subscriptions')
      .select('subscription')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('Failed to fetch push subscription:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
    }

    if (!subscriptionRow) {
      return NextResponse.json({ error: 'No push subscription found' }, { status: 404 });
    }

    const subscription = subscriptionRow.subscription as {
      endpoint: string;
      expirationTime: number | null;
      keys: { p256dh: string; auth: string };
    };

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
    });

    try {
      await webpush.sendNotification(subscription, notificationPayload);
    } catch (pushError) {
      // If the subscription is no longer valid, remove it
      if (pushError instanceof Error && 'statusCode' in pushError) {
        const statusCode = (pushError as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from('user_push_subscriptions').delete().eq('user_id', userId);
        }
      }
      console.error('Push send failed:', pushError);
      return NextResponse.json({ error: 'Failed to send push notification' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}