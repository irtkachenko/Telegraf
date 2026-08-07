'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { resetBadge } from '@/components/layout/PwaRegister';
import type { FullChat, Message } from '@/types';

const BADGE_COUNT_STORAGE_KEY = 'telegraf:badge-count';

/**
 * Calculates the total number of UNREAD MESSAGES across all chats for the current user
 * and syncs it to the native PWA App Badge API (navigator.setAppBadge).
 */
export function useBadgeSync() {
  const { user } = useSupabaseAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user || typeof navigator === 'undefined') {
      return;
    }

    const updateBadge = () => {
      try {
        const chatsData = queryClient.getQueryData<{ pages: FullChat[][] }>(['chats']);
        if (!chatsData?.pages) return;

        const chats = chatsData.pages.flat();

        let totalUnreadMessages = 0;

        for (const chat of chats) {
          if (!chat.messages || chat.messages.length === 0) continue;

          const isCurrentUser = chat.user_id === user.id;
          const readMessageId = isCurrentUser
            ? chat.user_last_read_id
            : chat.recipient_last_read_id;

          const readMessage = chat.messages.find((m: Message) => m.id === readMessageId);
          const readAt = readMessage ? new Date(readMessage.created_at).getTime() : 0;

          // Count all incoming messages sent after the recipient's last_read timestamp
          for (const message of chat.messages) {
            if (message.sender_id === user.id) continue;
            const msgTime = new Date(message.created_at).getTime();
            if (msgTime > readAt) {
              totalUnreadMessages += 1;
            }
          }
        }

        try {
          localStorage.setItem(BADGE_COUNT_STORAGE_KEY, String(totalUnreadMessages));
        } catch {
          // Ignore storage errors
        }

        if ('setAppBadge' in navigator) {
          if (totalUnreadMessages > 0) {
            navigator.setAppBadge(totalUnreadMessages).catch(() => {});
          } else {
            resetBadge();
          }
        }
      } catch {
        // Ignore badge errors
      }
    };

    // Initial calculation
    updateBadge();

    // Subscribe to React Query cache changes for 'chats' and 'messages'
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      const key = event.query.queryKey[0];
      if (key === 'chats' || key === 'messages') {
        updateBadge();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, queryClient]);
}
