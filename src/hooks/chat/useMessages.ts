'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { useChatState } from '@/hooks/ui/useChatState';
import { useMessageViewTimer } from '@/hooks/ui/useMessageViewTimer';
import { getSafeTimestamp } from '@/lib/date-utils';
import { messagesApi } from '@/services';
import type { Message } from '@/types';
import { useMarkAsRead } from './useMarkAsRead';

/**
 * Hook for fetching and managing chat messages with infinite scroll and auto-read logic.
 */
export function useMessages(chatId: string, isCloseToBottom: boolean) {
  const { user } = useSupabaseAuth();
  const { mutate: markAsRead } = useMarkAsRead();
  const readTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastMarkedRef = useRef<string | null>(null);

  const query = useInfiniteQuery<
    Message[],
    Error,
    InfiniteData<Message[]>,
    string[],
    string | undefined
  >({
    queryKey: ['messages', chatId],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      if (!chatId) return [];

      return await messagesApi.getMessages(chatId, pageParam);
    },
    initialPageParam: undefined,
    getPreviousPageParam: (firstPage): string | undefined => {
      if (!firstPage || firstPage.length < 50) return undefined;
      return firstPage[0].created_at;
    },
    getNextPageParam: () => undefined,
    enabled: !!chatId,
    refetchOnWindowFocus: false,
  });

  // Get all messages in a flattened memoized format
  const allMessages = useMemo(() => query.data?.pages.flat() || [], [query.data?.pages]);

  // Filter and deduplicate messages with memory optimization
  const validMessages = useMemo(() => {
    if (allMessages.length === 0) return [];

    // 1. Quick filter invalid messages
    const filtered = allMessages.filter((msg) => {
      if (!msg?.id) return false;

      // Validate optimistic message integrity
      if (msg.is_optimistic) {
        const hasValidContent = msg.content && msg.content.trim().length > 0;
        const hasValidAttachments = msg.attachments && msg.attachments.length > 0;
        if (!(hasValidContent || hasValidAttachments)) return false;
      }

      return true;
    });

    // 2. Memory-efficient deduplication
    const idMap = new Map<string, Message>();
    const clientMap = new Map<string, string>();

    for (const msg of filtered) {
      // Check client_id conflicts
      if (msg.client_id) {
        const existingId = clientMap.get(msg.client_id);
        if (existingId) {
          const existingMsg = idMap.get(existingId);
          // Replace optimistic with real message
          if (existingMsg?.is_optimistic && !msg.is_optimistic) {
            idMap.delete(existingId);
            idMap.set(msg.id, msg);
            clientMap.set(msg.client_id, msg.id);
            continue;
          } else if (!existingMsg?.is_optimistic && msg.is_optimistic) {
            // Skip late optimistic update
            continue;
          }
        }
        clientMap.set(msg.client_id, msg.id);
      }

      // Standard deduplication
      const existing = idMap.get(msg.id);
      if (!existing || (existing.is_optimistic && !msg.is_optimistic)) {
        idMap.set(msg.id, msg);
      }
    }

    // 3. Convert to array and sort only if necessary
    const result = Array.from(idMap.values());
    if (result.length > 1) {
      result.sort((a, b) => getSafeTimestamp(a.created_at) - getSafeTimestamp(b.created_at));
    }
    return result;
  }, [allMessages]);

  const { startViewing, stopViewing, isViewedLongEnough } = useMessageViewTimer();
  const { isChatOpen, isWindowFocused, isDocumentVisible, openChat, closeChat } = useChatState();

  // Mark the current chat as open for auto-read logic.
  useEffect(() => {
    if (!chatId) return;
    openChat(chatId);
    return () => {
      closeChat(chatId);
    };
  }, [chatId, openChat, closeChat]);

  useEffect(() => {
    lastMarkedRef.current = null;
  }, [chatId]);

  // Advanced auto-read logic with full criteria checking
  useEffect(() => {
    if (validMessages.length === 0 || !user?.id) return;

    // If the chat isn't in an active reading state, clear pending timers
    const chatIsActive = isChatOpen && isWindowFocused && isDocumentVisible && isCloseToBottom;
    if (!chatIsActive) {
      readTimersRef.current.forEach((timer, messageId) => {
        clearTimeout(timer);
        stopViewing(messageId);
      });
      readTimersRef.current.clear();
      return;
    }

    // When chat is active and close to bottom, the newest incoming message is visible enough.
    const incomingMessages = validMessages.filter((m) => m.sender_id !== user.id);

    if (incomingMessages.length === 0) return;

    // Target the newest incoming message from the other user.
    const targetMessage = incomingMessages[incomingMessages.length - 1];

    if (!targetMessage || lastMarkedRef.current === targetMessage.id) return;

    // Cleanup timers for stale targets.
    const incomingIds = new Set(incomingMessages.map((m) => m.id));
    readTimersRef.current.forEach((timer, messageId) => {
      if (!incomingIds.has(messageId) || messageId !== targetMessage.id) {
        clearTimeout(timer);
        readTimersRef.current.delete(messageId);
        stopViewing(messageId);
      }
    });

    // Start viewing + schedule read only once
    if (!readTimersRef.current.has(targetMessage.id)) {
      startViewing(targetMessage.id);

      const timer = setTimeout(() => {
        const stillEligible = isCloseToBottom && isChatOpen && isWindowFocused && isDocumentVisible;

        if (stillEligible && isViewedLongEnough(targetMessage.id, 500)) {
          markAsRead({ chatId, messageId: targetMessage.id });
          lastMarkedRef.current = targetMessage.id;
        }

        stopViewing(targetMessage.id);
        readTimersRef.current.delete(targetMessage.id);
      }, 500);

      readTimersRef.current.set(targetMessage.id, timer);
    }
  }, [
    validMessages,
    user?.id,
    chatId,
    markAsRead,
    isCloseToBottom,
    isWindowFocused,
    isDocumentVisible,
    isViewedLongEnough,
    startViewing,
    stopViewing,
    isChatOpen,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = readTimersRef.current;

    return () => {
      timers.forEach((timer, messageId) => {
        clearTimeout(timer);
        stopViewing(messageId);
      });
      timers.clear();
    };
  }, [stopViewing]);

  return { ...query, messages: validMessages };
}
