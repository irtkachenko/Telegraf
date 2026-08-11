import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { showInAppBanner } from '@/components/ui/in-app-banner';
import { chatsApi, messagesApi } from '@/services';
import type { ChatRow, FullChat, Message } from '@/types';
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

function toFallbackFullChat(row: ChatRow): FullChat {
  return {
    ...row,
    messages: [],
    participants: [],
    user: null,
    recipient: null,
  };
}

function isCurrentUserParticipant(
  chat: { user_id: string; recipient_id: string | null },
  userId: string,
) {
  return chat.user_id === userId || chat.recipient_id === userId;
}

function upsertChatInCaches(queryClient: QueryClient, chat: FullChat) {
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
}

function patchChatInCaches(queryClient: QueryClient, chatPatch: Partial<ChatRow> & { id: string }) {
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
}

async function hydrateAndUpsertChat(
  queryClient: QueryClient,
  chatId: string,
  fallback?: ChatRow,
) {
  try {
    const fullChat = await chatsApi.getChatById(chatId);
    if (fullChat) {
      upsertChatInCaches(queryClient, fullChat);
      return;
    }
  } catch {
    // Hydration failed — use fallback if available
  }

  if (fallback) {
    upsertChatInCaches(queryClient, toFallbackFullChat(fallback));
  }
}

function hasChatInCache(queryClient: QueryClient, chatId: string): boolean {
  const cached = queryClient.getQueryData<InfiniteData<FullChat[]>>(['chats']);
  if (!cached) return false;
  return cached.pages.some((page) => page.some((chat) => chat.id === chatId));
}

function findChatIdByMessageId(queryClient: QueryClient, messageId: string): string | null {
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
}

function updateMessageInCache(queryClient: QueryClient, msg: Message) {
  queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
    upsertChatLastMessage(old, msg.chat_id, msg),
  );
  if (!hasChatInCache(queryClient, msg.chat_id)) {
    void hydrateAndUpsertChat(queryClient, msg.chat_id);
  }

  const messagesKey = ['messages', msg.chat_id];
  queryClient.setQueryData<InfiniteData<Message[]>>(messagesKey, (old) => {
    // If the messages cache for this chat isn't populated yet (e.g. a realtime
    // INSERT landed before the initial query resolved), seed it so the
    // auto-read logic can see the new incoming message instead of dropping it.
    if (!old) {
      return { pages: [[msg]], pageParams: [undefined] };
    }

    const existingPageIdx = old.pages.findIndex((page) =>
      page.some(
        (m) =>
          m.id === msg.id || (m.client_id && msg.client_id && m.client_id === msg.client_id),
      ),
    );

    if (existingPageIdx !== -1) {
      const newPages = [...old.pages];
      newPages[existingPageIdx] = newPages[existingPageIdx].map((m) => {
        if (
          m.id === msg.id ||
          (m.client_id && msg.client_id && m.client_id === msg.client_id)
        ) {
                    return {
            ...m,
            ...msg,
            // E2EE: не потерто розшифрований текст плейсхолдером '🔒' — якщо
            // повідомлення вже розшифроване (або оптимістичне текстове), зберігаємо
            // його, а то реальний INSERT/UPDATE з контентом '🔒' робить бульяр порожнім.
            content: msg.content === '🔒' ? m.content ?? msg.content : msg.content,
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

    const newPages = [...old.pages];
    const lastPageIdx = newPages.length - 1;
    newPages[lastPageIdx] = [...newPages[lastPageIdx], msg];
    return { ...old, pages: newPages };
  });
}

function updateChatListMessageInCache(queryClient: QueryClient, msg: Message) {
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

  const messagesKey = ['messages', msg.chat_id];
  queryClient.setQueryData<InfiniteData<Message[]>>(messagesKey, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page: Message[]) =>
        page.map((m) => {
          if (m.id === normalizedMessage.id) {
                        return {
              ...m,
              ...normalizedMessage,
              // E2EE: не потерто розшифрований текст плейсхолдером '🔒'.
              content:
                normalizedMessage.content === '🔒'
                  ? m.content ?? normalizedMessage.content
                  : normalizedMessage.content,
              reply_details: normalizedMessage.reply_details || m.reply_details,
              reply_to: normalizedMessage.reply_to || m.reply_to,
            };
          }
          return m;
        }),
      ),
    };
  });
}

// --- Public handlers — використовуються в useChatsRealtime ---

export async function handleMessageInsert(
  queryClient: QueryClient,
  user: User,
  payload: { new: unknown; old: unknown; eventType: string },
) {
  if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;
  const nakedMessage = payload.new as Message;

  const isFromMe = nakedMessage.sender_id === user.id;
  // The realtime payload does NOT include the joined `sender` (name/image),
  // so we must hydrate the full message to get the sender's avatar/name.
  // This fixes missing avatars on new incoming messages.
  const needsHydration = !isFromMe && !nakedMessage.sender;

  let messageToCache = nakedMessage;

  if (needsHydration) {
    try {
      const fullMessage = await messagesApi.getMessage(nakedMessage.id);
      messageToCache = fullMessage;
      updateMessageInCache(queryClient, fullMessage);
    } catch {
      updateMessageInCache(queryClient, nakedMessage);
    }
  } else {
    updateMessageInCache(queryClient, nakedMessage);
  }

  // Trigger In-App Notification Banner if message is from another user and current chat is not open
  if (!isFromMe && typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    const isCurrentChatOpen = currentPath === `/chat/${nakedMessage.chat_id}`;

    if (!isCurrentChatOpen) {
      const senderName = messageToCache.sender?.name || 'Користувач';
      const senderAvatar = messageToCache.sender?.image || null;
            // E2EE: контент повідомлення від сервера — плейсхолдер '🔒'.
      // Не показуємо його в банері — замінюємо на дружнє повідомлення
      // (або '📎 Вкладення', якщо є файли), бо справжній текст розшифровується
      // лише у чаті одержувача.
      const rawText = messageToCache.content;
      const text =
        rawText && rawText !== '🔒'
          ? rawText
          : Array.isArray(messageToCache.attachments) && messageToCache.attachments.length > 0
            ? '📎 Вкладення'
            : 'Нове повідомлення';

      showInAppBanner({
        chatId: nakedMessage.chat_id,
        senderName,
        senderAvatar,
        text,
      });
    }
  }
}

export async function handleMessageUpdate(
  queryClient: QueryClient,
  payload: { new: unknown; old: unknown; eventType: string },
) {
  if (!payload.new || typeof payload.new !== 'object' || !('id' in (payload.new as Record<string, unknown>))) return;
  const nakedMessage = payload.new as Message;
  if (!(nakedMessage.id && nakedMessage.chat_id)) return;

  updateChatListMessageInCache(queryClient, nakedMessage);

  try {
    const fullMessage = await messagesApi.getMessage(nakedMessage.id);
    updateChatListMessageInCache(queryClient, fullMessage);
  } catch {
    // fallback — вже оновили з nakedMessage
  }
}

export function handleMessageDelete(
  queryClient: QueryClient,
  payload: { new: unknown; old: unknown; eventType: string },
) {
  if (!payload.old || typeof payload.old !== 'object' || !('id' in payload.old)) return;
  const deletedId = payload.old.id as string;
  if (!deletedId) return;

  const deletedChatId =
    ((payload.old as Record<string, unknown>).chat_id as string | undefined) || findChatIdByMessageId(queryClient, deletedId);

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
}

export function handleChatInsert(
  queryClient: QueryClient,
  user: User,
  payload: { new: unknown; old: unknown; eventType: string },
) {
  if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;
  const chatRow = payload.new as ChatRow;
  if (!isCurrentUserParticipant(chatRow, user.id)) return;

  void hydrateAndUpsertChat(queryClient, chatRow.id, chatRow);
}

export function handleChatUpdate(
  queryClient: QueryClient,
  user: User,
  payload: { new: unknown; old: unknown; eventType: string },
) {
  if (!payload.new || typeof payload.new !== 'object' || !('id' in payload.new)) return;
  const chatRow = payload.new as ChatRow;
  if (!isCurrentUserParticipant(chatRow, user.id)) return;

  patchChatInCaches(queryClient, chatRow);

  if (!hasChatInCache(queryClient, chatRow.id)) {
    void hydrateAndUpsertChat(queryClient, chatRow.id, chatRow);
  }
}

export function handleChatDelete(
  queryClient: QueryClient,
  payload: { new: unknown; old: unknown; eventType: string },
) {
  if (!payload.old || typeof payload.old !== 'object' || !('id' in payload.old)) return;
  const deletedChatId = payload.old.id as string;
  if (!deletedChatId) return;

  queryClient.setQueryData(['chats'], (old: InfiniteData<FullChat[]> | undefined) =>
    removeChat(old, deletedChatId),
  );
  queryClient.removeQueries({ queryKey: ['chat', deletedChatId], exact: true });
  queryClient.removeQueries({ queryKey: ['messages', deletedChatId], exact: true });
}