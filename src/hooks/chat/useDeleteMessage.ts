'use client';

import { type InfiniteData, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { messagesApi } from '@/services';
import { clearPushNotifications } from '@/services/push';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Message } from '@/types';

/**
 * Хук для видалення повідомлення.
 */
export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      return await messagesApi.deleteMessage(messageId);
    },
    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: ['messages', chatId] });
      const previousData = queryClient.getQueryData(['messages', chatId]);

      queryClient.setQueryData(['messages', chatId], (old: InfiniteData<Message[]> | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => page.filter((msg) => msg.id !== messageId)),
        };
      });

      return { previousData };
    },
    onError: (error: Error & { status?: number }) => {
      handleError(
        new NetworkError(
          error.message,
          'deleteMessage',
          'DELETE_MESSAGE_ERROR',
          error.status || 500,
        ),
        'DeleteMessage',
      );
    },
    onSuccess: () => {
      toast.success('Повідомлення видалено');
      // Очищення push-сповіщень та скидання badge при видаленні повідомлень
      void clearPushNotifications();
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
    },
  });
}
