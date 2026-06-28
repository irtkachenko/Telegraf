'use client';

import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User as SupabaseUser,
} from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useE2EEInit } from '@/hooks/keys';
import { useGlobalRealtime } from '@/hooks/useGlobalRealtime';
import { createClient } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, DatabaseError } from '@/shared/lib/errors';
import type { AppUser } from '@/types';
import { UserUtils } from '@/types/auth';

interface AuthContextType {
  user: AppUser | null;
  supabaseUser: SupabaseUser | null;
  loading: boolean;
  supabase: SupabaseClient;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  supabaseUser: null,
  loading: true,
  supabase: {} as SupabaseClient,
  refreshUser: async () => {},
});

export const useSupabaseAuth = () => useContext(AuthContext);

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
    },
    [normalizeUser],
  );

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error) {
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
          await handleAuthStateChange('INITIAL_SESSION', user ? ({ user } as Session) : null);
        }
      } catch {
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
