import { AnimatePresence, motion } from 'framer-motion';
import Linkify from 'linkify-react';
import { Check, CheckCheck, Clock, Download, Edit, FileIcon, Reply, Trash2, User } from 'lucide-react';
import { memo } from 'react';
import Image from 'next/image';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { formatMessageDate } from '@/lib/date-utils';
import { isValidUrlForLinkify } from '@/lib/sanitize';
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
  }: MessageBubbleProps) => {
    const senderId = message.sender_id;
    const isMe = senderId === currentUserId;
    const isEdited = !!message.updated_at;

    const mediaAttachments =
      message.attachments?.filter((a: Attachment) => a.type === 'image' || a.type === 'video') ||
      [];
    const fileAttachments = message.attachments?.filter((a: Attachment) => a.type === 'file') || [];

    const formattedDate = formatMessageDate(message.created_at);
    
    // Get sender display details
    const senderName = message.sender?.name || (isMe ? 'Ви' : otherParticipantName || 'Користувач Telegraf');
    const senderImage = message.sender?.image;

    return (
      <motion.div
        id={`message-${message.id}`}
        key={message.client_id || message.id}
        data-highlighted={isHighlighed}
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        className={cn(
          'w-full flex gap-3 items-start py-2.5 px-4 rounded-md transition-all duration-350 relative group',
          isHighlighed ? 'bg-[#5e6ad2]/8' : 'hover:bg-white/[0.01]',
        )}
      >
        {/* Highlight Overlay */}
        <AnimatePresence>
          {isHighlighed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 border-l-2 border-[#5e6ad2] pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Sender Avatar */}
        <div className="relative w-8 h-8 rounded-full shrink-0 select-none">
          <div className="w-full h-full rounded-full bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center border border-white/10 overflow-hidden">
            {senderImage ? (
              <Image
                src={senderImage}
                alt={senderName}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </div>

        {/* Message Container */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header metadata */}
          <div className="flex items-baseline gap-2 select-none mb-0.5">
            <span
              className={cn(
                'text-xs font-bold transition-colors',
                isMe ? 'text-[#8d96e9]' : 'text-gray-200 group-hover:text-white'
              )}
            >
              {senderName}
            </span>
            <span className="text-[9px] font-medium text-gray-500" suppressHydrationWarning>
              {formattedDate}
            </span>
            {isEdited && (
              <span className="text-[9px] font-medium text-gray-500">(відредаговано)</span>
            )}
            
            {/* Delivery/Read status */}
            {isMe && (
              <span className="inline-flex items-center ml-1">
                {message.is_optimistic ? (
                  <Clock className="w-2.5 h-2.5 text-gray-500" />
                ) : isRead ? (
                  <CheckCheck className="w-2.5 h-2.5 text-[#8d96e9]" />
                ) : (
                  <Check className="w-2.5 h-2.5 text-gray-500" />
                )}
              </span>
            )}
          </div>

          <ContextMenu>
            <ContextMenuTrigger className="w-full min-w-0 block">
              <div className="flex flex-col min-w-0 w-full">
                <div
                  className={cn(
                    'min-w-0 max-w-full flex flex-col',
                    isEditing && 'ring-1 ring-[#5e6ad2]/50 rounded p-1 bg-white/[0.02]',
                  )}
                >
                  {/* Reply Target Details */}
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
                      (replySenderId === currentUserId ? 'Ви' : otherParticipantName || 'Співрозмовник');

                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onScrollToMessage(fallbackReply.id);
                        }}
                        className="mb-1.5 w-full max-w-lg flex flex-col items-start px-2 py-1 rounded bg-white/[0.02] border-l-2 border-[#5e6ad2]/40 cursor-pointer hover:bg-white/[0.04] transition-colors text-[10px] text-left overflow-hidden min-w-0 border-y border-r border-white/[0.03]"
                      >
                        <span className="font-bold text-[#8d96e9] mb-0.5 truncate w-full block">
                          {replySenderName}
                        </span>
                        <span className="text-gray-400 line-clamp-1 italic">
                          {fallbackReply.content ||
                            (fallbackReply.attachments?.length ? '📎 Вкладення' : '...')}
                        </span>
                      </button>
                    );
                  })()}

                  {/* Text Content */}
                  {message.content && (
                    <div className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap break-all sm:break-words block w-full max-w-full overflow-hidden min-w-0">
                      <Linkify
                        options={{
                          target: '_blank',
                          rel: 'noopener noreferrer',
                          className:
                            'text-[#8d96e9] hover:text-white underline underline-offset-4 transition-colors cursor-pointer',
                          validate: {
                            url: isValidUrlForLinkify,
                          },
                        }}
                      >
                        {message.content}
                      </Linkify>
                    </div>
                  )}

                  {/* Media Attachments */}
                  {mediaAttachments.length > 0 && (
                    <div className="rounded-lg overflow-hidden mt-1.5 max-w-xl w-full border border-white/[0.05]">
                      <MessageMediaGrid items={mediaAttachments} onMediaSettled={onMediaSettled} />
                    </div>
                  )}

                  {/* Document/File Attachments */}
                  {fileAttachments.length > 0 && (
                    <div className="mt-2 space-y-1.5 max-w-md w-full min-w-0">
                      {fileAttachments.map((file: Attachment) => (
                        <a
                          key={file.id}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-white/[0.05] w-full min-w-0 group"
                        >
                          <div className="p-1.5 bg-[#5e6ad2]/10 group-hover:bg-[#5e6ad2]/20 rounded transition-colors shrink-0">
                            <FileIcon className="w-4 h-4 text-[#8d96e9]" />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-xs font-medium text-gray-200 truncate w-full block">
                              {file.metadata?.name || 'Файл'}
                            </p>
                            <p className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">
                              {file.metadata?.size
                                ? `${(file.metadata.size / 1024 / 1024).toFixed(2)} MB`
                                : 'розмір невідомий'}
                            </p>
                          </div>
                          <Download className="w-3.5 h-3.5 text-gray-500 group-hover:text-white shrink-0 transition-colors mr-1" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ContextMenuTrigger>

            <ContextMenuContent className="z-[110] bg-[#121216] border border-white/[0.08] text-white rounded-md p-1 w-44">
              <ContextMenuItem onClick={() => onReply(message)} className="gap-2 text-xs py-1.5 rounded-md hover:bg-white/5 cursor-pointer">
                <Reply className="w-3.5 h-3.5" /> Відповісти
              </ContextMenuItem>
              {isMe && (
                <>
                  <ContextMenuSeparator className="bg-white/[0.05]" />
                  <ContextMenuItem onClick={() => onEdit(message)} className="gap-2 text-xs py-1.5 rounded-md hover:bg-white/5 cursor-pointer">
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
