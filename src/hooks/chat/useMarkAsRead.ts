'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, NetworkError } from '@/shared/lib/errors';
import type { FullChat } from '@/types';
import { clearPushNotifications } from '@/services/push';
import { mapChatsInfinite } from './chats-cache';

// Validation schema
const markAsReadSchema = z.object({
  chatId: z.string().uuid('Invalid chat ID'),
  messageId: z.string().uuid('Invalid message ID'),
});

export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;

/**
 * Хук для відмітки повідомлень як прочитаних з rate limiting.
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useSupabaseAuth();

  return useMutation({
    mutationFn: async ({ chatId, messageId }: MarkAsReadInput) => {
      if (!user?.id) throw new AuthError('User not authenticated', 'MARK_READ_AUTH_REQUIRED', 401);

      // Validate input
      const validated = markAsReadSchema.parse({ chatId, messageId });

      // Use Supabase client directly instead of server action
      const { supabase } = await import('@/lib/supabase/client');

      const { error: updateError } = await supabase.rpc('rpc_mark_chat_as_read', {
        p_chat_id: validated.chatId,
        p_message_id: validated.messageId,
      });

      if (updateError) {
        throw new NetworkError(
          updateError.message || 'Failed to mark as read',
          'markAsRead',
          'MARK_READ_ERROR',
          500,
        );
      }

      return { success: true, chatId: validated.chatId, messageId: validated.messageId };
    },

    onMutate: async ({ chatId, messageId }) => {
      await queryClient.cancelQueries({ queryKey: ['chats'] });
      await queryClient.cancelQueries({ queryKey: ['chat', chatId], exact: true });

      const previousChats = queryClient.getQueryData(['chats']);
      const previousChatDetails = queryClient.getQueryData(['chat', chatId]);

      queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
        mapChatsInfinite(old, (chat) => {
          if (chat.id !== chatId) return chat;
          const isCurrentUser = chat.user_id === user?.id;
          if (isCurrentUser) {
            return { ...chat, user_last_read_id: messageId };
          }
          return { ...chat, recipient_last_read_id: messageId };
        }),
      );

      queryClient.setQueryData<FullChat>(['chat', chatId], (old) => {
        if (!old) return old;
        const isCurrentUser = old.user_id === user?.id;
        if (isCurrentUser) {
          return { ...old, user_last_read_id: messageId };
        }
        return { ...old, recipient_last_read_id: messageId };
      });

      return { previousChats, previousChatDetails };
    },

    onError: (error, _variables, context) => {
      handleError(error, 'useMarkAsRead', { enableToast: true });

      if (context?.previousChats) {
        queryClient.setQueryData(['chats'], context.previousChats);
      }
      if (context?.previousChatDetails) {
        queryClient.setQueryData(['chat', _variables.chatId], context.previousChatDetails);
      }
    },

    onSuccess: ({ chatId, messageId }) => {
      queryClient.setQueryData<FullChat>(['chat', chatId], (old) => {
        if (!old) return old;
        const isCurrentUser = old.user_id === user?.id;
        if (isCurrentUser) {
          return { ...old, user_last_read_id: messageId };
        }
        return { ...old, recipient_last_read_id: messageId };
      });

      // Clear push notifications and reset PWA badge counter on read
      void clearPushNotifications();
    },
  });
}
