'use client';

import type {
  AuthChangeEvent,
  Session,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './auth-context';
import { useE2EEInit } from '@/hooks/keys';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { createClient } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, DatabaseError } from '@/shared/lib/errors';
import type { AppUser } from '@/types';
import { UserUtils } from '@/types/auth';

export { useSupabaseAuth } from './auth-context';

async function fetchDbProfile(
  supabase: ReturnType<typeof createClient>,
  supabaseUser: SupabaseUser,
): Promise<Partial<AppUser> | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, image, last_seen, is_online')
      .eq('id', supabaseUser.id)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to fetch DB profile:', error.message);
      }
      return null;
    }

    return data
      ? {
          id: data.id,
          name: data.name,
          image: data.image,
          last_seen: data.last_seen,
          is_online: data.is_online ?? false,
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Upsert user profile into the `users` table to ensure the user has a DB entry.
 * This fixes the issue where users who signed up before the handle_new_user migration
 * don't have entries in the users table, causing message.sender to be null.
 */
async function upsertUserProfile(
  supabase: ReturnType<typeof createClient>,
  supabaseUser: SupabaseUser,
): Promise<void> {
  try {
    const metadata = supabaseUser.user_metadata as Record<string, unknown> | undefined;
    const name = (metadata?.name as string) || (metadata?.full_name as string) || supabaseUser.email?.split('@')[0] || null;
    const image = (metadata?.avatar_url as string) || (metadata?.picture as string) || null;

    const { error } = await supabase.from('users').upsert(
      {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name,
        image,
      },
      { onConflict: 'id' },
    );

    if (error && process.env.NODE_ENV === 'development') {
      console.warn('Failed to upsert user profile:', error.message);
    }
  } catch {
    // Silently fail - this is a non-critical operation
  }
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const normalizeUser = useCallback(
    async (supabaseUser: SupabaseUser | null) => {
      if (!supabaseUser) {
        setUser(null);
        return;
      }

      // Ensure the user has a profile in the users table
      await upsertUserProfile(supabase, supabaseUser);

      const dbProfile = await fetchDbProfile(supabase, supabaseUser);
      const normalizedUser = UserUtils.normalize(supabaseUser, dbProfile);
      setUser(normalizedUser);
    },
    [supabase],
  );

  const refreshUser = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user) {
      setSupabaseUser(user);
      await normalizeUser(user);
    }
  }, [supabase, normalizeUser]);

  const handleAuthStateChange = useCallback(
    async (event: AuthChangeEvent, session: Session | null) => {
      console.log('[Auth] Auth state changed:', event, session?.user?.email || 'null');

      if (event === 'INITIAL_SESSION') {
        setLoading(false);
      }

      const currentUser = session?.user ?? null;
      setSupabaseUser(currentUser);

      if (currentUser) {
        await normalizeUser(currentUser);
      } else {
        setUser(null);
      }

      console.log('[Auth] User session state:', { 
        userId: currentUser?.id || null, 
        isLoading: false 
      });
    },
    [normalizeUser],
  );

  // Safety timeout: if loading takes too long, force it to false
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000); // 5 second safety timeout

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('[Auth] Initializing auth...');
        
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error) {
          console.log('[Auth] Auth init error:', error.message);
          if (error.status === 400 || error.status === 401) {
            setLoading(false);
            return;
          }

          handleError(
            new AuthError(error.message, 'INITIAL_USER_ERROR', error.status),
            'AuthProvider',
            { enableToast: false },
          );
          setLoading(false);
        } else {
          console.log('[Auth] Auth init success, user:', user?.email || 'null');
          await handleAuthStateChange('INITIAL_SESSION', user ? ({ user } as Session) : null);
        }
      } catch {
        console.log('[Auth] Auth init exception');
        handleError(
          new DatabaseError('Error during auth initialization', 'authInit', 'AUTH_INIT_ERROR', 500),
          'AuthProvider',
        );
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, handleAuthStateChange]);

  useGlobalRealtime(supabaseUser);

  // Ініціалізація E2EE ключів для автентифікованого користувача
  useE2EEInit();

  const value = useMemo(
    () => ({
      user,
      supabaseUser,
      loading,
      supabase,
      refreshUser,
    }),
    [user, supabaseUser, loading, supabase, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
