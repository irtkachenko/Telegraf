import { AnimatePresence, motion } from 'framer-motion';
import Linkify from 'linkify-react';
import {
  Check,
  CheckCheck,
  Clock,
  Download,
  Edit,
  FileIcon,
  Reply,
  Trash2,
  User,
} from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { formatMessageDate } from '@/lib/date-utils';
import { downloadDecryptedFile, isEncryptedAttachment } from '@/lib/decrypt-attachment';
import { isValidUrlForLinkify } from '@/lib/sanitize';
import { extractStorageRef } from '@/lib/storage-utils';
import { cn } from '@/lib/utils';
import type { Attachment, Message } from '@/types';
import MessageMediaGrid from './MessageMediaGrid';

interface MessageBubbleProps {
  message: Message;
  currentUserId: string | undefined;
  isRead?: boolean;
  isEditing?: boolean;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
  isHighlighed?: boolean;
  otherParticipantName?: string;
  onMediaSettled?: () => void;
  /** E2EE shared secret for the chat — used to decrypt file downloads. */
  sharedSecret?: CryptoKey;
  /** Chat id used as AES-GCM AAD during file decryption. */
  chatId?: string;
  /** True if this encrypted message could not be decrypted (key mismatch). */
  failedToDecrypt?: boolean;
}

const MessageBubble = memo(
  ({
    message,
    currentUserId,
    isRead,
    isEditing,
    onReply,
    onEdit,
    onDelete,
    onScrollToMessage,
    isHighlighed,
    otherParticipantName,
    onMediaSettled,
    sharedSecret,
    chatId,
    failedToDecrypt = false,
  }: MessageBubbleProps) => {
    const senderId = message.sender_id;
    const isMe = senderId === currentUserId;
    const isEdited = !!message.updated_at;

    // E2EE: не показуємо плейсхолдер «🔒» — поки не розшифровано, показуємо нейтральний стан.
    const isEncryptedUndecrypted =
      !!message.encrypted_content &&
      (message.content === null || message.content === '' || message.content === '🔒');

    const mediaAttachments =
      message.attachments?.filter((a: Attachment) => a.type === 'image' || a.type === 'video') ||
      [];
    const fileAttachments = message.attachments?.filter((a: Attachment) => a.type === 'file') || [];

    const formattedDate = formatMessageDate(message.created_at);

    // Get sender display details
    const senderName =
      message.sender?.name || (isMe ? 'Ви' : otherParticipantName || 'Користувач Telegraf');
    const senderImage = message.sender?.image;

    const { getUrl } = useStorageUrl();

    const handleFileDownload = useCallback(
      async (file: Attachment) => {
        try {
          const ref = extractStorageRef(file.url);
          if (!ref) return;
          const signedUrl = await getUrl(ref.bucket, ref.path);
          if (sharedSecret && chatId && isEncryptedAttachment(file)) {
            await downloadDecryptedFile(sharedSecret, chatId, file, signedUrl);
          } else {
            window.open(signedUrl, '_blank', 'noopener,noreferrer');
          }
        } catch {
          toast.error('Не вдалося завантажити файл');
        }
      },
      [getUrl, sharedSecret, chatId],
    );

    return (
      <motion.div
        id={`message-${message.id}`}
        key={message.client_id || message.id}
        data-highlighted={isHighlighed}
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        className={cn(
          'w-full flex items-start gap-2.5 py-1.5 px-5 transition-all duration-200 relative group',
          isMe ? 'flex-row-reverse' : 'flex-row',
          isHighlighed ? 'bg-[#5e6ad2]/6' : 'hover:bg-white/[0.02]',
        )}
      >
        {/* Highlight Overlay */}
        <AnimatePresence>
          {isHighlighed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-y-1 left-0 w-0.5 bg-[#5e6ad2] rounded-full pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Sender Avatar - only show for other users */}
        {!isMe && (
          <div className="relative w-7 h-7 rounded-full shrink-0 select-none mt-1">
            <div className="w-full h-full rounded-full bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center border border-white/10 overflow-hidden">
              {senderImage ? (
                <Image
                  src={senderImage}
                  alt={senderName}
                  fill
                  sizes="28px"
                  className="object-cover"
                />
              ) : (
                <User className="w-3.5 h-3.5 text-gray-500" />
              )}
            </div>
          </div>
        )}

        {/* Spacer for alignment when it's my message */}
        {isMe && <div className="w-7 shrink-0" />}

        {/* Message Container */}
        <div
          className={cn('flex flex-col min-w-0 max-w-[75%]', isMe ? 'items-end' : 'items-start')}
        >
          {/* Sender name - only for other users, above the bubble */}
          {!isMe && (
            <span className="text-[11px] font-semibold text-gray-400 transition-colors group-hover:text-gray-300 select-none mb-1">
              {senderName}
            </span>
          )}

          <ContextMenu>
            <ContextMenuTrigger className="w-full min-w-0 block">
              <div className="flex flex-col min-w-0 w-full">
                <div
                  className={cn(
                    'min-w-0 max-w-full flex flex-col',
                    isEditing && 'ring-1 ring-[#5e6ad2]/40 rounded-lg overflow-hidden',
                  )}
                >
                  {/* Reply Target Details - Telegram readable style */}
                  {(() => {
                    const rId = message.reply_to_id;
                    if (!rId) return null;

                    const reply = message.reply_details || message.reply_to;
                    const fallbackReply = reply || {
                      id: rId,
                      sender: { name: null },
                      sender_id: null,
                      content: 'Завантаження...',
                      attachments: null,
                    };

                    const replySenderId = fallbackReply.sender_id;
                    const replySenderName =
                      fallbackReply.sender?.name ||
                      (replySenderId === currentUserId
                        ? 'Ви'
                        : otherParticipantName || 'Співрозмовник');

                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onScrollToMessage(fallbackReply.id);
                        }}
                        className={cn(
                          'mb-1.5 w-full max-w-lg flex flex-col items-start px-2.5 py-1.5 rounded-lg bg-white/[0.03] border-l-[3px] border-[#5e6ad2]/50 cursor-pointer hover:bg-white/[0.05] transition-colors text-[11px] text-left overflow-hidden min-w-0',
                          isMe && 'self-end',
                        )}
                      >
                        <span className="font-semibold text-[#6b7ae0] mb-0.5 truncate w-full block leading-tight">
                          {replySenderName}
                        </span>
                        <span className="text-gray-500 line-clamp-1 leading-snug">
                          {fallbackReply.content && fallbackReply.content !== '🔒'
                            ? fallbackReply.content
                            : fallbackReply.attachments?.length
                              ? '📎 Вкладення'
                              : '...'}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Bubble Content - Telegram readable style */}
                  <div
                    className={cn(
                      'rounded-xl px-3.5 py-2.5 w-full',
                      isMe ? 'bg-[#5e6ad2]/12 self-end' : 'bg-white/[0.04] self-start',
                    )}
                  >
                    {/* Text Content */}
                    {isEncryptedUndecrypted ? (
                      failedToDecrypt ? (
                        <div className="text-[13px] leading-[1.4] text-gray-500 italic select-none">
                          🔒 Повідомлення недоступне для розшифрування
                        </div>
                      ) : null
                    ) : message.content ? (
                      <div className="text-[15px] leading-[1.5] whitespace-pre-wrap break-words block w-full max-w-full overflow-hidden min-w-0">
                        <Linkify
                          options={{
                            target: '_blank',
                            rel: 'noopener noreferrer',
                            className:
                              'text-[#6b7ae0] hover:text-white underline underline-offset-2 transition-colors cursor-pointer',
                            validate: {
                              url: isValidUrlForLinkify,
                            },
                          }}
                        >
                          {message.content}
                        </Linkify>
                      </div>
                    ) : null}

                    {/* Media Attachments - Linear style: clean grid */}
                    {mediaAttachments.length > 0 && (
                      <div className="rounded-lg overflow-hidden mt-2 -mx-1 -mb-1 border border-white/[0.06]">
                        <MessageMediaGrid
                          items={mediaAttachments}
                          onMediaSettled={onMediaSettled}
                          sharedSecret={sharedSecret}
                          chatId={chatId}
                        />
                      </div>
                    )}

                    {/* Document/File Attachments - Linear style: clean file card */}
                    {fileAttachments.length > 0 && (
                      <div className="mt-2 space-y-1.5 max-w-md w-full min-w-0">
                        {fileAttachments.map((file: Attachment) => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => handleFileDownload(file)}
                            className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-all w-full min-w-0 group cursor-pointer"
                          >
                            <div className="p-1.5 bg-[#5e6ad2]/10 rounded transition-colors shrink-0">
                              <FileIcon className="w-3.5 h-3.5 text-[#6b7ae0]" />
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <p className="text-xs font-medium text-gray-300 truncate w-full block group-hover:text-white transition-colors">
                                {file.metadata?.name || 'Файл'}
                              </p>
                              <p className="text-[10px] text-gray-600 mt-0.5">
                                {file.metadata?.size
                                  ? `${(file.metadata.size / 1024 / 1024).toFixed(2)} MB`
                                  : 'розмір невідомий'}
                              </p>
                            </div>
                            <Download className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-300 shrink-0 transition-colors" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Timestamp & Read Receipts - below message content */}
                    <div
                      className={cn(
                        'flex items-center gap-1.5 select-none mt-1.5',
                        isMe ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span
                        className="text-[10px] font-medium text-gray-600"
                        suppressHydrationWarning
                      >
                        {formattedDate}
                      </span>
                      {isEdited && (
                        <span className="text-[10px] font-medium text-gray-600">
                          (відредаговано)
                        </span>
                      )}
                      {/* Delivery/Read status */}
                      {isMe && (
                        <span className="inline-flex items-center">
                          {message.is_optimistic ? (
                            <Clock className="w-2.5 h-2.5 text-gray-600" />
                          ) : isRead ? (
                            <CheckCheck className="w-2.5 h-2.5 text-[#6b7ae0]" />
                          ) : (
                            <Check className="w-2.5 h-2.5 text-gray-600" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ContextMenuTrigger>

            <ContextMenuContent className="z-[110] bg-[#121216] border border-white/[0.08] text-white rounded-lg p-1 w-44 shadow-xl">
              <ContextMenuItem
                onClick={() => onReply(message)}
                className="gap-2 text-xs py-1.5 rounded-md hover:bg-white/5 cursor-pointer"
              >
                <Reply className="w-3.5 h-3.5" /> Відповісти
              </ContextMenuItem>
              {isMe && (
                <>
                  <ContextMenuSeparator className="bg-white/[0.05]" />
                  <ContextMenuItem
                    onClick={() => onEdit(message)}
                    className="gap-2 text-xs py-1.5 rounded-md hover:bg-white/5 cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" /> Редагувати
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => onDelete(message.id)}
                    className="gap-2 text-xs py-1.5 rounded-md text-red-400 focus:text-red-400 focus:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Видалити
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </motion.div>
    );
  },
);

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
