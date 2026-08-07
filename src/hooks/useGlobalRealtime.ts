'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { usePresenceSubscription } from '@/store/usePresenceStore';

/**
 * Hook for global realtime (presence, notifications).
 * Must be called at top level (AuthProvider).
 */
export function useGlobalRealtime(user: User | null) {
  const { subscribe, unsubscribe } = usePresenceSubscription();

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    // Subscribe to presence using singleton manager
    subscribe(user);

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, subscribe, unsubscribe]);
}
