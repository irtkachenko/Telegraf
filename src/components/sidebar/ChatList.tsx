'use client';

import { MessageSquare, Trash2, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useChats, useDeleteChat } from '@/hooks/chat';
import { formatRelativeTime } from '@/lib/date-utils';
import type { FullChat, Message } from '@/types';
import { PresenceIndicator } from './PresenceIndicator';

function ChatListBase() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useChats();
  const { user, loading: isAuthLoading } = useSupabaseAuth();
  const deleteChat = useDeleteChat();
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const pathname = usePathname();

  const currentUserId = user?.id;

  // Об'єднуємо всі сторінки в один масив
  const chats = useMemo(() => data?.pages.flat() || [], [data?.pages]);
  const isBootstrapping = isAuthLoading || !(user || data);
  const showInitialLoader = isBootstrapping || (isLoading && chats.length === 0);

  // Debug лог для Virtuoso
  const validChats = useMemo(() => chats.filter((chat) => chat?.id), [chats]);

  const handleChatClick = () => {
    window.dispatchEvent(new CustomEvent('close-mobile-sidebar'));
  };

  const handleDeleteChat = (chatId: string) => {
    setChatToDelete(chatId);
  };

  const handleConfirmDelete = () => {
    if (chatToDelete) {
      deleteChat.mutate(chatToDelete);
      setChatToDelete(null);
    }
  };

  // Функція для рендерингу одного чату
  const renderChat = (_index: number, chat: FullChat) => {
    const partner = chat.user_id === currentUserId ? chat.recipient : chat.user;
    const chatDisplayTitle = partner?.name || chat.title || 'Користувач Telegraf';
    const partnerImage = partner?.image;

    // Перевіряємо, чи є цей чат активним
    const isActiveChat = pathname === `/chat/${chat.id}`;

    const lastMessage = chat.messages?.[0];

    // Determine which read field to check based on who the current user is
    const isCurrentUser = chat.user_id === currentUserId;
    const readMessageId = isCurrentUser ? chat.user_last_read_id : chat.recipient_last_read_id;

    // Find the read message in the messages array to get its created_at timestamp
    const readMessage = chat.messages?.find((m: Message) => m.id === readMessageId);
    const readAt = readMessage?.created_at;

    const isUnread =
      lastMessage &&
      lastMessage.sender_id !== currentUserId &&
      (!readAt || new Date(lastMessage.created_at) > new Date(readAt));

    return (
      <ContextMenu key={chat.id}>
        <ContextMenuTrigger>
          <Link
            href={`/chat/${chat.id}`}
            onClick={handleChatClick}
            className={`flex items-center gap-2.5 mx-2 py-2 px-2.5 rounded-lg transition-all border group flex-1 ${
              isActiveChat
                ? 'bg-white/[0.06] border-white/[0.06] shadow-sm'
                : 'border-transparent hover:bg-white/[0.02] hover:border-white/[0.02]'
            }`}
          >
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center border border-white/10 overflow-hidden">
                {partnerImage ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={partnerImage}
                      alt={chatDisplayTitle}
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <User className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                )}
              </div>
              <PresenceIndicator
                userId={partner?.id || ''}
                className="absolute bottom-0 right-0 w-2 h-2 border-black"
                showOffline={false}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1.5">
                <p
                  className={`text-xs font-semibold truncate transition-colors flex-1 min-w-0 ${
                    isActiveChat ? 'text-white' : 'text-gray-300 group-hover:text-white'
                  }`}
                >
                  {chatDisplayTitle}
                </p>

                {lastMessage && (
                  <span className="text-[9px] text-gray-500 whitespace-nowrap">
                    {formatRelativeTime(lastMessage.created_at)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-1.5 mt-0.5">
                <p
                  className={`text-[10px] truncate flex-1 transition-colors ${
                    isActiveChat ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  {lastMessage?.sender_id === currentUserId && 'Ви: '}
                  {lastMessage?.content ||
                    (Array.isArray(lastMessage?.attachments) && lastMessage.attachments.length > 0
                      ? '📎 Медіа'
                      : 'Немає повідомлень')}
                </p>
                {isUnread && (
                  <div className="w-1.5 h-1.5 bg-[#5e6ad2] rounded-full shadow-[0_0_6px_rgba(94,106,210,0.6)] shrink-0" />
                )}
              </div>
            </div>
          </Link>
        </ContextMenuTrigger>

        <ContextMenuContent className="z-[110] bg-[#121216] border border-white/[0.08] text-white rounded-md p-1">
          <ContextMenuItem onClick={handleChatClick} className="gap-2 text-xs py-1.5 rounded-md hover:bg-white/5">
            <MessageSquare className="w-3.5 h-3.5" /> Відкрити чат
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-white/[0.05]" />
          <ContextMenuItem
            onClick={() => handleDeleteChat(chat.id)}
            className="text-red-400 focus:text-red-400 focus:bg-red-500/10 gap-2 text-xs py-1.5 rounded-md"
          >
            <Trash2 className="w-3.5 h-3.5" /> Видалити чат
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Функція для рендерингу футера (індикатор завантаження)
  const renderFooter = () => {
    if (!hasNextPage && chats.length > 0) {
      return (
        <div className="py-4 text-center">
          <div className="text-[10px] text-gray-600">Всі чати завантажено</div>
        </div>
      );
    }

    if (isFetchingNextPage) {
      return (
        <div className="py-4 text-center">
          <div className="text-sm text-gray-500">Завантаження...</div>
        </div>
      );
    }

    return null;
  };

  if (showInitialLoader) {
    return <div className="p-8 text-center text-sm text-gray-500 mt-10">Завантаження...</div>;
  }

  if (!(chats.length || isLoading || isAuthLoading) && user) {
    return <div className="p-8 text-center text-sm text-gray-500 mt-10">Немає діалогів</div>;
  }

  return (
    <>
      {validChats.length > 0 ? (
        <Virtuoso
          data={validChats}
          itemContent={renderChat}
          endReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          overscan={20}
          components={{
            Footer: renderFooter,
          }}
          className="flex-1"
          style={{ height: '100%' }}
        />
      ) : null}

      <ConfirmationDialog
        open={!!chatToDelete}
        onOpenChange={(open) => !open && setChatToDelete(null)}
        title="Delete Chat"
        description="Are you sure? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        isLoading={deleteChat.isPending}
      />
    </>
  );
}

export const ChatList = memo(ChatListBase);
