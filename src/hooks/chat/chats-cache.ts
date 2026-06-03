import type { InfiniteData } from '@tanstack/react-query';
import { chatConfig } from '@/config/chat.config';
import type { FullChat, Message } from '@/types';

export function getChatSortDate(chat: FullChat): number {
  const date = chat.messages?.[0]?.created_at || chat.created_at;
  return new Date(date).getTime();
}

export function rebuildPages(flat: FullChat[], pageSize: number): FullChat[][] {
  const pages: FullChat[][] = [];
  for (let i = 0; i < flat.length; i += pageSize) {
    pages.push(flat.slice(i, i + pageSize));
  }
  return pages;
}

export function mapChatsInfinite(
  data: InfiniteData<FullChat[]> | undefined,
  mapper: (chat: FullChat) => FullChat | null,
): InfiniteData<FullChat[]> | undefined {
  if (!data) return data;

  const pages = data.pages.map((page) => page.map(mapper).filter(Boolean) as FullChat[]);

  return { ...data, pages };
}

export function upsertChatLastMessage(
  data: InfiniteData<FullChat[]> | undefined,
  chatId: string,
  message: Message,
): InfiniteData<FullChat[]> | undefined {
  if (!data) return data;

  const flat = data.pages.flat();
  const index = flat.findIndex((chat) => chat.id === chatId);
  if (index === -1) {
    return data;
  }

  flat[index] = {
    ...flat[index],
    messages: [message],
  };

  // Keep list order fresh by last message date (or chat created date)
  flat.sort((a, b) => getChatSortDate(b) - getChatSortDate(a));

  const pageSize = data.pages[0]?.length || chatConfig.pageSize;
  return { ...data, pages: rebuildPages(flat, pageSize) };
}

export function updateChatMessageIfMatches(
  data: InfiniteData<FullChat[]> | undefined,
  chatId: string,
  predicate: (message: Message | undefined) => boolean,
  updater: (chat: FullChat) => FullChat,
): InfiniteData<FullChat[]> | undefined {
  if (!data) return data;

  const pages = data.pages.map((page) =>
    page.map((chat) => {
      if (chat.id !== chatId) return chat;
      if (!predicate(chat.messages?.[0])) return chat;
      return updater(chat);
    }),
  );

  return { ...data, pages };
}

export function upsertChat(
  data: InfiniteData<FullChat[]> | undefined,
  chat: FullChat,
): InfiniteData<FullChat[]> | undefined {
  if (!data) return data;

  const flat = data.pages.flat();
  const index = flat.findIndex((item) => item.id === chat.id);

  if (index === -1) {
    flat.unshift(chat);
  } else {
    flat[index] = {
      ...flat[index],
      ...chat,
      messages: chat.messages ?? flat[index].messages,
      user: chat.user ?? flat[index].user,
      recipient: chat.recipient ?? flat[index].recipient,
      participants: chat.participants ?? flat[index].participants,
    };
  }

  flat.sort((a, b) => getChatSortDate(b) - getChatSortDate(a));
  const pageSize = data.pages[0]?.length || chatConfig.pageSize;
  return { ...data, pages: rebuildPages(flat, pageSize) };
}

export function removeChat(
  data: InfiniteData<FullChat[]> | undefined,
  chatId: string,
): InfiniteData<FullChat[]> | undefined {
  if (!data) return data;

  const flat = data.pages.flat().filter((chat) => chat.id !== chatId);
  const pageSize = data.pages[0]?.length || chatConfig.pageSize;
  return { ...data, pages: rebuildPages(flat, pageSize) };
}