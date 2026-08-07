'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { resetBadge } from '@/components/layout/PwaRegister';
import { supabase } from '@/lib/supabase/client';

const BADGE_COUNT_STORAGE_KEY = 'telegraf:badge-count';

/**
 * Calculates the EXACT total number of unread MESSAGES across ALL chats for the current user,
 * querying the database to ensure we get the full count (not just the 1 cached message per chat).
 */
export async function getExactUnreadMessageCount(userId: string): Promise<number> {
  try {
    const { data: userChats, error: chatsError } = await supabase
      .from('chats')
      .select('id, user_id, recipient_id, user_last_read_id, recipient_last_read_id')
      .or(`user_id.eq.${userId},recipient_id.eq.${userId}`);

    if (chatsError || !userChats || userChats.length === 0) return 0;

    let totalUnreadMessages = 0;

    for (const chat of userChats) {
      const isUser = chat.user_id === userId;
      const lastReadId = isUser ? chat.user_last_read_id : chat.recipient_last_read_id;

      let msgQuery = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .neq('sender_id', userId);

      if (lastReadId) {
        const { data: readMsg } = await supabase
          .from('messages')
          .select('created_at')
          .eq('id', lastReadId)
          .maybeSingle();

        if (readMsg?.created_at) {
          msgQuery = msgQuery.gt('created_at', readMsg.created_at);
        }
      }

      const { count, error: countError } = await msgQuery;
      if (!countError && typeof count === 'number') {
        totalUnreadMessages += count;
      }
    }

    return totalUnreadMessages;
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

    // Initial sync
    void syncBadge();

    // Subscribe to React Query cache changes
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        const key = event.query.queryKey[0];
        if (key === 'chats' || key === 'messages') {
          void syncBadge();
        }
      });
    } catch {
      // Ignore
    }

    return () => {
      isSubscribed = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, queryClient]);
}
