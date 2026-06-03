'use client';

import { createBrowserClient } from '@supabase/ssr';
import { handleError } from '@/shared/lib/error-handler';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Return existing client if already created in browser
  if (typeof window !== 'undefined' && client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!(supabaseUrl && supabaseAnonKey)) {
    console.error('Missing Supabase environment variables');
  }

  const newClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options) => {
        // Check if we want to disable toast for this specific request
        const skipToast =
          options?.headers &&
          (options.headers as Record<string, string>)['x-skip-toast'] === 'true';

        const response = await fetch(url, options);

        if (!(response.ok || skipToast)) {
          if (response.status === 401) return response;

          try {
            const errorData = await response.clone().json();
            const message =
              errorData?.message || errorData?.error_description || response.statusText;

            const error = new Error(`HTTP ${response.status}: ${message}`) as Error & {
              status: number;
            };
            error.status = response.status;
            handleError(error, 'SupabaseFetch');
          } catch {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & {
              status: number;
            };
            error.status = response.status;
            handleError(error, 'SupabaseFetch');
          }
        }

        return response;
      },
    },
  });

  if (typeof window !== 'undefined') client = newClient;
  return newClient;
}

export const supabase = createClient();
