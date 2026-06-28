'use client';

import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { useEditMessage } from '@/hooks/chat';
import { useSendMessageWithFiles } from '@/hooks/chat/useSendMessageWithFiles';
import { useSharedSecret } from '@/hooks/keys';
import { useStorageLimits } from '@/hooks/useDynamicStorageConfig';
import { useOptimisticAttachmentLazy } from '@/hooks/useOptimisticAttachmentLazy';
import { cn } from '@/lib/utils';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Message } from '@/types';
import ComposerAddons from './ComposerAddons';

interface ChatInputProps {
  chatId: string;
  setTyping: (typing: boolean) => void;
  replyToId?: string | null;
  onReplyCancel?: () => void;
  editingMessage?: Message | null;
  onEditCancel?: () => void;
  onMessageSent?: () => void;
  recipientId?: string;
}

export default function ChatInput({
  chatId,
  setTyping,
  replyToId,
  onReplyCancel,
  editingMessage,
  onEditCancel,
  onMessageSent,
  recipientId,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const { user } = useSupabaseAuth();
  const { attachments, addFiles, removeAttachment, clearAttachments, hasAttachments } =
    useOptimisticAttachmentLazy();
  const { getAcceptString } = useStorageLimits();

  // Pre-load the shared secret for E2EE (caches in react-query)
  useSharedSecret(chatId, recipientId);

  const sendMessageWithFiles = useSendMessageWithFiles(chatId, { recipientId });
  const editMessage = useEditMessage(chatId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (editingMessage) {
        setContent(editingMessage.content || '');
        textareaRef.current?.focus();
      } else {
        setContent('');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [editingMessage]);

  useEffect(() => {
    if (replyToId) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [replyToId]);

  const replyToMessage = !replyToId
    ? null
    : queryClient
        .getQueryData<InfiniteData<Message[]>>(['messages', chatId])
        ?.pages?.flat()
        .find((m) => m.id === replyToId) || null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = content.trim();
    const hasFiles = attachments.length > 0;
    const isEditingFlow = !!editingMessage;

    if (!(trimmed || hasFiles)) return;

    if (isEditingFlow && !trimmed) {
      toast.error('Повідомлення не може бути порожнім');
      return;
    }

    try {
      if (isEditingFlow && editingMessage) {
        await editMessage.mutateAsync({
          messageId: editingMessage.id,
          content: trimmed,
        });
        setContent('');
        setTyping(false);
        onEditCancel?.();
      } else {
        const filesToSend = attachments.map((a) => a.file);

        // Clear input immediately for snappy UX on optimistic append.
        setContent('');
        setTyping(false);
        clearAttachments();
        onReplyCancel?.();
        onEditCancel?.();
        onMessageSent?.();

        const clientId = crypto.randomUUID();
        await sendMessageWithFiles.mutateAsync({
          content: trimmed,
          files: filesToSend,
          reply_to_id: replyToId || undefined,
          client_id: clientId,
        });
      }
    } catch {
      handleError(
        new NetworkError('Failed to process message', 'message', 'MESSAGE_PROCESS_ERROR', 500),
        'ChatInput',
      );
      setContent(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    setTyping(content.length > 0);
  }, [content, setTyping]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      await addFiles(Array.from(files));
    }
    e.target.value = '';
  };

  const isSubmitDisabled = sendMessageWithFiles.isPending || !(content.trim() || hasAttachments);

  return (
    <div 
      className="flex flex-col relative border border-white/10 rounded-xl bg-white/[0.02] focus-within:border-[#5e6ad2]/50 focus-within:ring-1 focus-within:ring-[#5e6ad2]/30 focus-within:bg-[#0c0d0f]/60 transition-all duration-300"
      style={{ willChange: 'transform' }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
        accept={getAcceptString()}
      />

      {/* Composer Addons inside the border wrapper at the top */}
      <ComposerAddons
        attachments={attachments.map(({ file, previewUrl, ...attachment }) => ({
          ...attachment,
          file,
          uploading: false,
          url: previewUrl,
          previewUrl,
        }))}
        onAttachmentRemove={removeAttachment}
        replyTo={replyToMessage}
        onReplyCancel={onReplyCancel}
        editingMessage={editingMessage || null}
        onEditCancel={onEditCancel}
        otherParticipantName="Співрозмовник"
        currentUserId={user?.id}
      />

      <form onSubmit={handleSubmit} className="flex flex-col">
        {/* Input Textarea */}
        <div className="flex-1 w-full relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишіть повідомлення..."
            className={cn(
              'w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-4 pt-3 pb-2 text-xs text-white placeholder:text-gray-500',
              'resize-none overflow-y-auto leading-relaxed',
              'scrollbar-hide',
            )}
            style={{ minHeight: '44px' }}
          />
        </div>

        {/* Toolbar section at the bottom */}
        <div className="border-t border-white/[0.04] px-3 py-1.5 flex items-center justify-between select-none">
          {/* Left tools (Attachment icon) */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-gray-400 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
              title="Додати файл"
            >
              <Paperclip size={14} />
            </button>
            {hasAttachments && (
              <span className="text-[10px] text-gray-500 font-medium">
                {attachments.length} файл(ів) додано
              </span>
            )}
          </div>

          {/* Right tools (Send button) */}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer shrink-0',
                isSubmitDisabled
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-transparent'
                  : 'bg-[#5e6ad2] text-white hover:bg-[#4e5ac2] hover:shadow-[0_0_12px_rgba(94,106,210,0.3)] border border-white/10 active:scale-[0.98]'
              )}
            >
              <Send size={11} className={sendMessageWithFiles.isPending ? 'animate-pulse' : ''} />
              <span>Надіслати</span>
              <span className={cn(
                'text-[8px] px-1 py-0.5 rounded font-normal',
                isSubmitDisabled ? 'bg-white/5 text-gray-600' : 'bg-white/10 text-[#8d96e9]'
              )}>
                ↵
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
