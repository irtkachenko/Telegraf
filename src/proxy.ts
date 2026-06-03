import { type NextRequest, NextResponse } from 'next/server';
import { isStaticAsset } from '@/config/storage.config';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

export default async function middleware(request: NextRequest) {
  // Skip middleware for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  if (isStaticAsset(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const { supabase, supabaseResponse } = await createMiddlewareClient(request);

  try {
    // Get user and update token if expired
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const url = request.nextUrl.clone();
    const path = url.pathname;

    const isPublicPage = path === '/' || path.startsWith('/auth');

    if (!(user || isPublicPage)) {
      url.pathname = '/';
      const redirectResponse = NextResponse.redirect(url);

      const cookies = supabaseResponse.cookies.getAll() as Array<{
        name: string;
        value: string;
        [key: string]: unknown;
      }>;
      cookies.forEach((c) => redirectResponse.cookies.set(c.name, c.value, c));
      return redirectResponse;
    }

    if (user && isPublicPage) {
      url.pathname = '/chat';
      const redirectResponse = NextResponse.redirect(url);

      const cookies = supabaseResponse.cookies.getAll() as Array<{
        name: string;
        value: string;
        [key: string]: unknown;
      }>;
      cookies.forEach((c) => redirectResponse.cookies.set(c.name, c.value, c));
      return redirectResponse;
    }
  } catch {
    if (request.nextUrl.pathname !== '/' && !request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
