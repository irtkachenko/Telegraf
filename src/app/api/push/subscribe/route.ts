import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = getAdminClient();

    if (!adminClient) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
        { status: 500 },
      );
    }

    const endpointParam = request.nextUrl.searchParams.get('endpoint');

    const { data: rows, error } = await adminClient
      .from('user_push_subscriptions')
      .select('id, subscription')
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to check push subscription:', error);
      return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 });
    }

    const hasAnySub = rows && rows.length > 0;

    if (!endpointParam) {
      return NextResponse.json({ subscribed: hasAnySub, matchedEndpoint: hasAnySub });
    }

    const matchedRow = rows?.find(
      (r: { subscription?: { endpoint?: string } }) => r.subscription?.endpoint === endpointParam,
    );

    return NextResponse.json({
      subscribed: hasAnySub,
      matchedEndpoint: !!matchedRow,
    });
  } catch (error) {
    console.error('Push subscription status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
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
    const subscription = body?.subscription;

    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    if (!adminClient) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
        { status: 500 },
      );
    }

    // UPSERT: one device = one row. If the endpoint already exists for this user,
    // update it; otherwise insert a new row. This prevents duplicate subscriptions.
    const { error: upsertError } = await adminClient
      .from('user_push_subscriptions')
      .upsert(
        { user_id: user.id, subscription },
        { onConflict: 'user_id,subscription->>endpoint' },
      );

    if (upsertError) {
      console.error('Failed to save push subscription:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save subscription', details: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = getAdminClient();

    if (!adminClient) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' },
        { status: 500 },
      );
    }

    const endpointParam = request.nextUrl.searchParams.get('endpoint');

    let query = adminClient.from('user_push_subscriptions').delete().eq('user_id', user.id);

    if (endpointParam) {
      query = query.filter('subscription->>endpoint', 'eq', endpointParam);
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to delete push subscription:', error);
      return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
