'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import ChatInput from '@/components/chat/ChatInput';
import MessageBubble from '@/components/chat/MessageBubble';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  useChatDetails,
  useChatEvents,
  useDecryptChatMessages,
  useDeleteMessage,
  useMessages,
  useScrollToMessage,
} from '@/hooks/chat';
import { usePresence } from '@/hooks/user';
import { formatRelativeTime } from '@/lib/date-utils';
import { extractStorageRef } from '@/lib/storage-utils';
import { useStorageStore } from '@/store/useStorageStore';
import type { Message } from '@/types';

export default function ChatPage() {
  const SMART_SCROLL_NEAR_BOTTOM_ITEMS = 10;
  const params = useParams();
  const id =
    params.id && typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : '';
  const router = useRouter();
  const { user, supabaseUser, loading: isAuthLoading } = useSupabaseAuth();
  const clearStorageEntries = useStorageStore((state) => state.clearEntries);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const { data: chat, isLoading: isChatLoading, isError } = useChatDetails(id);
  const [isCloseToBottom, setIsCloseToBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const isNearBottomRef = useRef(true);
  const {
    messages,
    isLoading: isMessagesLoading,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useMessages(id, isCloseToBottom);

  const { typingUsers, setTyping } = useChatEvents(id, supabaseUser);
  const { onlineUsers } = usePresence();
  const deleteMessage = useDeleteMessage(id);

  // Дешифрування повідомлень E2EE
  const otherParticipant = chat?.participants?.find((p) => p.id !== user?.id);
  useDecryptChatMessages(id, otherParticipant?.id, messages);

  const { scrollToMessage, highlightedId } = useScrollToMessage(
    virtuosoRef,
    messages,
    fetchPreviousPage,
    hasPreviousPage,
    id,
  );

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const showScrollButton = !isCloseToBottom;
  const [showLoader, setShowLoader] = useState(true);
  const isPageLoading = isAuthLoading || isChatLoading || isMessagesLoading;
  const prevMessagesRef = useRef<Message[]>([]);
  const initialScrollDoneRef = useRef(false);
  const pinToBottomUntilRef = useRef(0);
  const clearedMediaForChatRef = useRef<string | null>(null);

  const getMessageKey = useCallback((message: Message) => message.client_id || message.id, []);

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'auto', holdMs = 1400) => {
      if (!virtuosoRef.current || messages.length === 0) return;

      pinToBottomUntilRef.current = Date.now() + holdMs;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!virtuosoRef.current || messages.length === 0) return;
          virtuosoRef.current.scrollToIndex({
            index: messages.length - 1,
            align: 'end',
            behavior,
          });
        });
      });
    },
    [messages.length],
  );

  // Redirect on error
  useEffect(() => {
    if (!(isAuthLoading || isChatLoading) && (isError || !(chat || isMessagesLoading))) {
      router.replace('/');
    }
  }, [isAuthLoading, isChatLoading, chat, isError, router, isMessagesLoading]);

  // Loader logic
  useEffect(() => {
    if (isPageLoading) return;
    // Hide loader with small delay for smoothness
    const timer = setTimeout(() => setShowLoader(false), 300);
    return () => clearTimeout(timer);
  }, [isPageLoading]);

  const isLoaderVisible = isPageLoading || showLoader;

  // Reset per-chat refs
  useEffect(() => {
    prevMessagesRef.current = [];
    initialScrollDoneRef.current = false;
    pinToBottomUntilRef.current = 0;
    isAtBottomRef.current = true;
    isNearBottomRef.current = true;
  }, [id]);

  // Refresh only current chat media cache when a chat opens/reloads.
  useEffect(() => {
    if (!id || isMessagesLoading) return;
    if (clearedMediaForChatRef.current === id) return;

    const keys = new Set<string>();
    const urls = new Set<string>();

    for (const message of messages) {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];

      for (const attachment of attachments) {
        const url = attachment?.url;
        if (!url || typeof url !== 'string' || url.startsWith('blob:')) continue;

        urls.add(url);
        keys.add(`${attachment.id}:${url}`);

        const storageRef = extractStorageRef(url);
        if (storageRef) {
          keys.add(`${storageRef.bucket}:${storageRef.path}`);
        }
      }
    }

    clearStorageEntries(Array.from(keys), Array.from(urls));
    clearedMediaForChatRef.current = id;
  }, [id, isMessagesLoading, messages, clearStorageEntries]);

  // Scroll rules:
  // - initial load -> jump to latest message
  // - append from current user (optimistic or own message) -> smooth scroll
  // - incoming append from another user -> smart auto-scroll if we are near bottom
  // - edit/delete/prepend history -> no auto-scroll
  useEffect(() => {
    if (messages.length === 0) {
      prevMessagesRef.current = [];
      return;
    }

    const prevMessages = prevMessagesRef.current;
    const isDataReady = !(isMessagesLoading || isChatLoading);

    if (isDataReady && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      scrollToBottom('auto', 2200);
      prevMessagesRef.current = messages;
      return;
    }

    if (prevMessages.length > 0) {
      const prevLastKey = getMessageKey(prevMessages[prevMessages.length - 1]);
      const currentLastKey = getMessageKey(messages[messages.length - 1]);
      const wasAppendedAtBottom =
        messages.length > prevMessages.length && prevLastKey !== currentLastKey;

      if (wasAppendedAtBottom) {
        const prevLastIndexInCurrent = messages.findIndex((m) => getMessageKey(m) === prevLastKey);
        const appendedMessages =
          prevLastIndexInCurrent === -1
            ? [messages[messages.length - 1]]
            : messages.slice(prevLastIndexInCurrent + 1);

        const hasOptimisticAppend = appendedMessages.some((m) => m.is_optimistic);
        const hasOwnAppend = appendedMessages.some(
          (m) => !!m.sender_id && m.sender_id === user?.id,
        );
        const hasIncomingAppend = appendedMessages.some(
          (m) => !!m.sender_id && m.sender_id !== user?.id && !m.is_optimistic,
        );

        if (hasOptimisticAppend || hasOwnAppend) {
          scrollToBottom('smooth', 1800);
        } else if (hasIncomingAppend && isCloseToBottom) {
          scrollToBottom('smooth', 1200);
        }
      }
    }

    prevMessagesRef.current = messages;
  }, [
    messages,
    isMessagesLoading,
    isChatLoading,
    scrollToBottom,
    getMessageKey,
    user?.id,
    isCloseToBottom,
  ]);

  const handleMessageMediaSettled = useCallback(() => {
    const shouldKeepPinned = isCloseToBottom || Date.now() < pinToBottomUntilRef.current;
    if (shouldKeepPinned) {
      virtuosoRef.current?.autoscrollToBottom();
    }
  }, [isCloseToBottom]);

  // Interaction Handlers
  const handleReply = (message: Message) => {
    setEditingMessage(null);
    setReplyingTo(message);
  };

  const handleEdit = (message: Message) => {
    setReplyingTo(null);
    setEditingMessage(message);
  };

  const handleScrollToMessage = (messageId: string) => {
    scrollToMessage(messageId, { align: 'center' });
  };

  // Build index map for O(1) read-status checks
  const messageIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < messages.length; i++) {
      map.set(messages[i].id, i);
    }
    return map;
  }, [messages]);

  const otherParticipantReadId =
    user?.id && chat
      ? chat.user_id === user.id
        ? chat.recipient_last_read_id
        : chat.user_last_read_id
      : null;
  const isOnline = otherParticipant && onlineUsers.has(otherParticipant.id);
  const isTypingNow = otherParticipant && typingUsers.has(otherParticipant.id);

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] w-full bg-[#08080a] relative overflow-hidden">
      {isLoaderVisible && (
        <div className="absolute inset-0 z-30 flex items-center justify-center text-gray-400 bg-[#08080a] backdrop-blur-md">
          <div className="flex flex-col items-center gap-2.5">
            <div className="w-6 h-6 border-2 border-[#5e6ad2] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold text-gray-400 animate-pulse">Завантаження чату...</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div
        className="px-4.5 py-2.5 border-b border-white/[0.05] flex items-center justify-between backdrop-blur-md bg-[#0c0d0f]/50 sticky top-0 z-20"
        style={{ opacity: isLoaderVisible ? 0 : 1 }}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10 shadow">
            <Image
              src={otherParticipant?.image || '/default-avatar.png'}
              alt={otherParticipant?.name || 'User'}
              fill
              className="object-cover"
              sizes="32px"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white tracking-tight truncate leading-tight">
              {otherParticipant?.name || 'Невідомий користувач'}
            </h2>
            <div className="text-[9px] font-semibold transition-colors mt-0.5">
              {isTypingNow ? (
                <span className="text-[#8d96e9] animate-pulse">друкує...</span>
              ) : isOnline ? (
                <span className="text-green-400">в мережі</span>
              ) : (
                <span className="text-gray-500">
                  {otherParticipant?.last_seen
                    ? `був(ла) ${formatRelativeTime(otherParticipant.last_seen)}`
                    : 'не в мережі'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 relative min-h-0" style={{ opacity: isLoaderVisible ? 0 : 1 }}>
        {messages.length === 0 && !isMessagesLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mb-3 border border-white/[0.05] shadow-xl">
              <span className="text-2xl">💬</span>
            </div>
            <h3 className="text-white font-bold text-sm mb-1">Поки що порожньо</h3>
            <p className="text-gray-500 text-xs max-w-[240px]">
              Напишіть щось, щоб розпочати бесіду!
            </p>
          </div>
        ) : messages.length > 0 ? (
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            computeItemKey={(_index, message) => message.client_id || message.id}
            initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
            followOutput={false}
            alignToBottom
            atBottomThreshold={80}
            overscan={40}
            increaseViewportBy={{ bottom: 80, top: 60 }}
            className="no-scrollbar"
            atBottomStateChange={(atBottom) => {
              isAtBottomRef.current = atBottom;
              const next = atBottom || isNearBottomRef.current;
              setIsCloseToBottom((prev) => (prev === next ? prev : next));
            }}
            rangeChanged={(range) => {
              const lastIndex = messages.length - 1;
              if (lastIndex < 0) {
                isNearBottomRef.current = true;
                const next = true;
                setIsCloseToBottom((prev) => (prev === next ? prev : next));
                return;
              }

              const distanceToBottom = lastIndex - range.endIndex;
              isNearBottomRef.current = distanceToBottom <= SMART_SCROLL_NEAR_BOTTOM_ITEMS;
              const next = isAtBottomRef.current || isNearBottomRef.current;
              setIsCloseToBottom((prev) => (prev === next ? prev : next));
            }}
            startReached={() => {
              if (hasPreviousPage && !isFetchingPreviousPage) {
                fetchPreviousPage();
              }
            }}
            itemContent={(_index, message) => {
              // O(1) пошук індексу повідомлення
              const currentMessageIndex = messageIndexMap.get(message.id);
              const otherReadIndex = otherParticipantReadId
                ? messageIndexMap.get(otherParticipantReadId)
                : undefined;
              const isRead =
                currentMessageIndex !== undefined &&
                otherReadIndex !== undefined &&
                currentMessageIndex <= otherReadIndex;

              return (
                <div className="px-2 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full py-0.5">
                  <MessageBubble
                    message={message}
                    currentUserId={user?.id}
                    isRead={
                      // 1. Повідомлення відправив Я
                      message.sender_id === user?.id &&
                      // 2. У нас є ID прочитаного повідомлення від іншого користувача
                      !!otherParticipantReadId &&
                      // 3. O(1) порівняння індексів замість O(n) пошуку
                      isRead
                    }
                    isEditing={editingMessage?.id === message.id}
                    onReply={handleReply}
                    onEdit={handleEdit}
                    onDelete={setMessageToDelete}
                    onScrollToMessage={handleScrollToMessage}
                    isHighlighed={highlightedId === message.id}
                    otherParticipantName={otherParticipant?.name || undefined}
                    onMediaSettled={handleMessageMediaSettled}
                  />
                </div>
              );
            }}
            components={{
              Header: () => (
                <div className="py-10 text-center">
                  {isFetchingPreviousPage ? (
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest animate-pulse">
                      Завантаження...
                    </span>
                  ) : !hasPreviousPage && messages.length > 0 ? (
                    <span className="text-[10px] text-gray-600 uppercase tracking-widest opacity-50 italic">
                      Початок історії
                    </span>
                  ) : null}
                </div>
              ),
              Footer: () => <div className="h-10 w-full" />,
            }}
          />
        ) : null}

        <AnimatePresence>
          {showScrollButton && messages.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => {
                scrollToBottom('smooth', 1600);
              }}
              className="absolute bottom-5 right-5 p-2 rounded-md bg-[#121216] hover:bg-white/[0.08] border border-white/10 text-gray-400 hover:text-white shadow-xl z-10 transition-all cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Section */}
      <div className="w-full border-t border-white/[0.05] bg-[#0c0d0f]/50 backdrop-blur-md z-20">
        <div className="max-w-5xl mx-auto px-2 sm:px-6 py-2 sm:py-3.5">
          <ChatInput
            chatId={id}
            recipientId={otherParticipant?.id}
            setTyping={setTyping}
            replyToId={replyingTo?.id}
            onReplyCancel={() => setReplyingTo(null)}
            editingMessage={editingMessage}
            onEditCancel={() => setEditingMessage(null)}
            onMessageSent={() => {
              setReplyingTo(null);
              setEditingMessage(null);
            }}
          />
        </div>
        <div className="h-[env(safe-area-inset-bottom,12px)]" />
      </div>

      <ConfirmationDialog
        open={!!messageToDelete}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title="Видалити повідомлення?"
        description="Ця дія незворотна. Повідомлення зникне для обох учасників."
        onConfirm={() => {
          if (messageToDelete) {
            deleteMessage.mutate(messageToDelete);
            setMessageToDelete(null);
          }
        }}
        isLoading={deleteMessage.isPending}
      />
    </div>
  );
}
