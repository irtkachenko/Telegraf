import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

/**
 * Creates Supabase client instance for server-side use.
 * Uses React cache to ensure singleton within a single request.
 */
export const createClient = cache(async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // This exception occurs when we try to set cookies in Server Component,
          // where headers are already sent. This is normal behavior for Next.js App Router.
        }
      },
    },
    // Harden the session cookies: send only over HTTPS in production and scope to
    // same-site requests. NOTE: we intentionally do NOT set `httpOnly` here — the
    // @supabase/ssr browser client restores the session by reading this cookie via
    // document.cookie, so an httpOnly cookie would break session hydration.
    cookieOptions: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });
});
