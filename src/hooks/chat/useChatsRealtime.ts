'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  chatsApi,
  type RealtimeChatPayload,
  type RealtimeMessagePayload,
  realtimeApi,
  messagesApi,
} from '@/services';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Chat, FullChat, Message } from '@/types';
import {
  removeChat,
  updateChatMessageIfMatches,
  upsertChat,
  upsertChatLastMessage,
} from './chats-cache';

function normalizeChat(chat: FullChat): FullChat {
  return {
    ...chat,
    messages: chat.messages || [],
    participants: [chat.user, chat.recipient].filter(Boolean) as FullChat['participants'],
  };
}

function toFallbackFullChat(row: Chat): FullChat {
  return {
    ...row,
    messages: [],
    participants: [],
    user: null,
    recipient: null,
  };
}

function isCurrentUserParticipant(chat: { user_id: string; recipient_id: string | null }, userId: string) {
  return chat.user_id === userId || chat.recipient_id === userId;
}

export function useChatsRealtime(user: User | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    if (channelRef.current) {
      try {
        realtimeApi.unsubscribe(channelRef.current);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Error unsubscribing from existing channel:', error);
        }
      }
      channelRef.current = null;
    }

    const channel = realtimeApi.createMessagesChannel();
    channelRef.current = channel;

    const hasChatInCache = (chatId: string): boolean => {
      const cached = queryClient.getQueryData<InfiniteData<FullChat[]>>(['chats']);
      if (!cached) return false;
      return cached.pages.some((page) => page.some((chat) => chat.id === chatId));
    };

    const upsertChatInCaches = (chat: FullChat) => {
      const normalized = normalizeChat(chat);

      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        upsertChat(old, normalized),
      );

      queryClient.setQueryData<FullChat>(['chat', normalized.id], (old) => {
        if (!old) return normalized;
        return {
          ...old,
          ...normalized,
          participants:
            normalized.participants.length > 0
              ? normalized.participants
              : ([old.user, old.recipient].filter(Boolean) as FullChat['participants']),
          messages: normalized.messages.length > 0 ? normalized.messages : old.messages,
          user: normalized.user ?? old.user,
          recipient: normalized.recipient ?? old.recipient,
        };
      });
    };

    const patchChatInCaches = (chatPatch: Partial<Chat> & { id: string }) => {
      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) =>
                page.map((chat) => (chat.id === chatPatch.id ? { ...chat, ...chatPatch } : chat)),
              ),
            }
          : old,
      );

      queryClient.setQueryData<FullChat>(['chat', chatPatch.id], (old) => {
        if (!old) return old;
        return { ...old, ...chatPatch };
      });
    };

    const hydrateAndUpsertChat = async (chatId: string, fallback?: Chat) => {
      try {
        const fullChat = await chatsApi.getChatById(chatId);
        if (fullChat) {
          upsertChatInCaches(fullChat);
          return;
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to hydrate chat for realtime update:', error);
        }
      }

      if (fallback) {
        upsertChatInCaches(toFallbackFullChat(fallback));
      }
    };

    const findChatIdByMessageId = (messageId: string): string | null => {
      const chatsData = queryClient.getQueryData<InfiniteData<FullChat[]>>(['chats']);
      const fromChats = chatsData?.pages
        .flat()
        .find((chat) => chat.messages?.some((msg) => msg.id === messageId))?.id;

      if (fromChats) return fromChats;

      const messageQueries = queryClient.getQueriesData<InfiniteData<Message[]>>({
        queryKey: ['messages'],
      });

      for (const [queryKey, queryData] of messageQueries) {
        if (!Array.isArray(queryKey) || queryKey[0] !== 'messages') continue;
        const candidateChatId = queryKey[1];
        if (typeof candidateChatId !== 'string') continue;

        const hasMessage = queryData?.pages.some((page) =>
          page.some((message) => message.id === messageId),
        );
        if (hasMessage) return candidateChatId;
      }

      return null;
    };

    // Shared cache updater for both INSERT and UPDATE events
    // Extracted to avoid duplication between handleMessageInsert and handleMessageUpdate.
    const updateMessageInCache = (msg: Message) => {
      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        upsertChatLastMessage(old, msg.chat_id, msg),
      );
      if (!hasChatInCache(msg.chat_id)) {
        void hydrateAndUpsertChat(msg.chat_id);
      }

      queryClient.setQueryData<InfiniteData<Message[]>>(['messages', msg.chat_id], (old) => {
        if (!old) return old;

        // Try to find an existing page where this message (by id or client_id) already exists
        const existingPageIdx = old.pages.findIndex((page) =>
          page.some((m) => m.id === msg.id || (m.client_id && msg.client_id && m.client_id === msg.client_id)),
        );

        if (existingPageIdx !== -1) {
          // Update in-place within the existing page
          const newPages = [...old.pages];
          newPages[existingPageIdx] = newPages[existingPageIdx].map((m) => {
            if (m.id === msg.id || (m.client_id && msg.client_id && m.client_id === msg.client_id)) {
              return {
                ...m,
                ...msg,
                client_id: m.client_id || msg.client_id,
                id: m.id.startsWith('temp-') ? msg.id : m.id,
                reply_details: msg.reply_details || m.reply_details,
                reply_to: msg.reply_to || m.reply_to,
                is_optimistic: false,
              };
            }
            return m;
          });
          return { ...old, pages: newPages };
        }

        // Not found — append to the last page
        const newPages = [...old.pages];
        const lastPageIdx = newPages.length - 1;
        newPages[lastPageIdx] = [...newPages[lastPageIdx], msg];
        return { ...old, pages: newPages };
      });
    };

    const updateChatListMessageInCache = (msg: Message) => {
      const normalizedMessage = {
        ...msg,
        attachments: msg.attachments || [],
      } as Message;

      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        updateChatMessageIfMatches(
          old,
          msg.chat_id,
          (last) => last?.id === msg.id,
          (chat) => ({ ...chat, messages: [normalizedMessage] }),
        ),
      );

      queryClient.setQueryData<InfiniteData<Message[]>>(['messages', msg.chat_id], (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: Message[]) =>
            page.map((m) => {
              if (m.id === normalizedMessage.id) {
                return {
                  ...m,
                  ...normalizedMessage,
                  reply_details: normalizedMessage.reply_details || m.reply_details,
                  reply_to: normalizedMessage.reply_to || m.reply_to,
                };
              }
              return m;
            }),
          ),
        };
      });
    };

    const handleMessageInsert = async (payload: RealtimeMessagePayload) => {
      if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;

      const nakedMessage = payload.new as Message;

      const isFromMe = nakedMessage.sender_id === user.id;
      const needsHydration = !!nakedMessage.reply_to_id && !nakedMessage.reply_to;

      if (!isFromMe && needsHydration) {
        try {
          const fullMessage = await messagesApi.getMessage(nakedMessage.id);
          updateMessageInCache(fullMessage);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to fetch hydrated message for realtime insert:', error);
          }
          updateMessageInCache(nakedMessage);
        }
      } else {
        updateMessageInCache(nakedMessage);
      }
    };

    const handleMessageUpdate = async (payload: RealtimeMessagePayload) => {
      if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;

      const nakedMessage = payload.new as Message;
      if (!nakedMessage.id || !nakedMessage.chat_id) return;

      updateChatListMessageInCache(nakedMessage);

      // Also fetch the hydrated version to ensure reply_to data is up to date
      try {
        const fullMessage = await messagesApi.getMessage(nakedMessage.id);
        updateChatListMessageInCache(fullMessage);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to fetch hydrated message for realtime update:', error);
        }
      }
    };

    const handleMessageDelete = (payload: RealtimeMessagePayload) => {
      if (!payload.old || typeof payload.old !== 'object' || !('id' in payload.old)) return;

      const deletedId = payload.old.id as string;
      if (!deletedId) return;

      const deletedChatId =
        (payload.old.chat_id as string | undefined) || findChatIdByMessageId(deletedId);

      if (deletedChatId) {
        queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
          updateChatMessageIfMatches(
            old,
            deletedChatId,
            (last) => last?.id === deletedId,
            (chat) => ({
              ...chat,
              messages: chat.messages?.filter((m) => m.id !== deletedId) || [],
            }),
          ),
        );
      }

      const messageQueries = queryClient.getQueriesData<InfiniteData<Message[]>>({
        queryKey: ['messages'],
      });

      for (const [queryKey] of messageQueries) {
        queryClient.setQueryData<InfiniteData<Message[]>>(queryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: Message[]) => page.filter((m) => m.id !== deletedId)),
          };
        });
      }
    };

    const handleChatInsert = (payload: RealtimeChatPayload) => {
      if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;

      const chatRow = payload.new as Chat;
      if (!isCurrentUserParticipant(chatRow, user.id)) return;

      void hydrateAndUpsertChat(chatRow.id, chatRow);
    };

    const handleChatUpdate = (payload: RealtimeChatPayload) => {
      if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;

      const chatRow = payload.new as Chat;
      if (!isCurrentUserParticipant(chatRow, user.id)) return;

      patchChatInCaches(chatRow);

      if (!hasChatInCache(chatRow.id)) {
        void hydrateAndUpsertChat(chatRow.id, chatRow);
      }
    };

    const handleChatDelete = (payload: RealtimeChatPayload) => {
      if (!payload.old || typeof payload.old !== 'object' || !('id' in payload.old)) return;
      const deletedChatId = payload.old.id as string;
      if (!deletedChatId) return;

      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        removeChat(old, deletedChatId),
      );
      queryClient.removeQueries({ queryKey: ['chat', deletedChatId], exact: true });
      queryClient.removeQueries({ queryKey: ['messages', deletedChatId], exact: true });
    };

    realtimeApi.subscribeToAllMessages(channel, (payload: RealtimeMessagePayload) => {
      try {
        switch (payload.eventType) {
          case 'INSERT':
            void handleMessageInsert(payload);
            break;
          case 'UPDATE':
            void handleMessageUpdate(payload);
            break;
          case 'DELETE':
            handleMessageDelete(payload);
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

    realtimeApi.subscribeToChats(channel, (payload: RealtimeChatPayload) => {
      try {
        switch (payload.eventType) {
          case 'INSERT':
            handleChatInsert(payload);
            break;
          case 'UPDATE':
            handleChatUpdate(payload);
            break;
          case 'DELETE':
            handleChatDelete(payload);
            break;
        }
      } catch {
        handleError(
          new NetworkError('Failed to process realtime chat', 'realtime', 'REALTIME_CHAT_ERROR', 500),
          'useChatsRealtime',
        );
      }
    });

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        handleError(
          new NetworkError('Realtime channel error', 'realtime', 'REALTIME_CHANNEL_ERROR', 500),
          'ChatsRealtime',
          { enableToast: false },
        );
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        try {
          realtimeApi.unsubscribe(channelRef.current);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Error during channel cleanup:', error);
          }
        }
        channelRef.current = null;
      }
    };
  }, [user?.id, queryClient]);
}
