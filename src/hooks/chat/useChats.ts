'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { chatConfig } from '@/config/chat.config';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { chatsApi } from '@/services';
import type { FullChat } from '@/types';

/**
 * Хук для отримання списку чатів поточного користувача з підтримкою нескінченної пагінації.
 * Реалізовано як сінглтон через React Query кеш.
 */
export function useChats() {
  const { user } = useSupabaseAuth();

  return useInfiniteQuery<
    FullChat[],
    Error,
    InfiniteData<FullChat[]>,
    string[],
    number | undefined
  >({
    queryKey: ['chats'],
    queryFn: ({ pageParam = 1 }) => {
      if (!user) return [];
      return chatsApi.getChatsInfinite(user.id, pageParam);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      // Якщо остання сторінка менша за ліміт, то це кінець
      if (lastPage.length < chatConfig.pageSize) return undefined;
      // Інакше повертаємо номер наступної сторінки
      return allPages.length + 1;
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
  });
}
