'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { resetBadge } from '@/components/layout/PwaRegister';
import { supabase } from '@/lib/supabase/client';

const BADGE_COUNT_STORAGE_KEY = 'telegraf:badge-count';
const BADGE_SYNC_DEBOUNCE_MS = 2000;

/**
 * Calculates the EXACT total number of unread MESSAGES across ALL chats for the current user.
 * Uses a single aggregate RPC call instead of the previous N+1 client-side loop
 * (one query per chat + one per last_read lookup).
 */
export async function getExactUnreadMessageCount(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('rpc_get_unread_message_count');

    if (error) return 0;
    return typeof data === 'number' ? data : 0;
  } catch {
    return 0;
  }
}

export function useBadgeSync() {
  const { user } = useSupabaseAuth();
  let queryClient;

  try {
    queryClient = useQueryClient();
  } catch {
    return;
  }

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!user || typeof navigator === 'undefined') {
      return;
    }

    let isSubscribed = true;

    const syncBadge = async () => {
      try {
        const count = await getExactUnreadMessageCount(user.id);
        if (!isSubscribed) return;

        try {
          localStorage.setItem(BADGE_COUNT_STORAGE_KEY, String(count));
        } catch {
          // Ignore
        }

        if ('setAppBadge' in navigator) {
          if (count > 0) {
            navigator.setAppBadge(count).catch(() => {});
          } else {
            resetBadge();
          }
        }
      } catch {
        // Ignore errors
      }
    };

    // Debounced sync — coalesces bursts of cache events (e.g. realtime message
    // inserts, markAsRead optimistic updates) into a single RPC call.
    const debouncedSync = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void syncBadge();
      }, BADGE_SYNC_DEBOUNCE_MS);
    };

    // Initial sync
    void syncBadge();

    // Subscribe to React Query cache changes
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey[0];
        if (key === 'chats' || key === 'messages') {
          debouncedSync();
        }
      });
    } catch {
      // Ignore
    }

    return () => {
      isSubscribed = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user?.id, queryClient]);
}