'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { realtimeApi } from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import {
  handleChatDelete,
  handleChatInsert,
  handleChatUpdate,
  handleMessageDelete,
  handleMessageInsert,
  handleMessageUpdate,
} from './realtime-handlers';

export function useChatsRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Cleanup previous channel if exists
    if (channelRef.current) {
      try {
        realtimeApi.unsubscribe(channelRef.current);
      } catch {
        // ignore cleanup errors
      }
      channelRef.current = null;
    }

    const channel = realtimeApi.createMessagesChannel();
    channelRef.current = channel;

    // Підписка на події повідомлень
    realtimeApi.subscribeToAllMessages(channel, (payload) => {
      try {
        switch (payload.eventType) {
          case 'INSERT':
            void handleMessageInsert(queryClient, user, payload);
            break;
          case 'UPDATE':
            void handleMessageUpdate(queryClient, payload);
            break;
          case 'DELETE':
            handleMessageDelete(queryClient, payload);
            break;
        }
      } catch {
        handleError(
          new NetworkError(
            'Failed to process realtime message',
            'realtime',
            'REALTIME_MESSAGE_ERROR',
            500,
          ),
          'useChatsRealtime',
        );
      }
    });

    // Підписка на події чатів
    realtimeApi.subscribeToChats(channel, (payload) => {
      try {
        switch (payload.eventType) {
          case 'INSERT':
            handleChatInsert(queryClient, user, payload);
            break;
          case 'UPDATE':
            handleChatUpdate(queryClient, user, payload);
            break;
          case 'DELETE':
            handleChatDelete(queryClient, payload);
            break;
        }
      } catch {
        handleError(
          new NetworkError(
            'Failed to process realtime chat',
            'realtime',
            'REALTIME_CHAT_ERROR',
            500,
          ),
          'useChatsRealtime',
        );
      }
    });

    // Обробка помилок каналу
    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        handleError(
          new NetworkError('Realtime channel error', 'realtime', 'REALTIME_CHANNEL_ERROR', 500),
          'ChatsRealtime',
          { enableToast: false },
        );
      }
    });

    return () => {
      if (channelRef.current) {
        try {
          realtimeApi.unsubscribe(channelRef.current);
        } catch {
          // ignore cleanup errors
        }
        channelRef.current = null;
      }
    };
  }, [user?.id, queryClient]);
}