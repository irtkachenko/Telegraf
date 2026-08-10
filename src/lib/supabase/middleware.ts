import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function createMiddlewareClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Update cookies in request (for current server work)
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // Recreate response with updated request
        supabaseResponse = NextResponse.next({
          request,
        });

        // Update cookies in response (so they go to browser)
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
    // Harden the session cookies: HTTPS-only in production, same-site scoped.
    cookieOptions: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });

  return { supabase, supabaseResponse };
}
