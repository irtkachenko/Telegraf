import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { Message, OptimisticAttachment } from '@/types';
import AttachmentPreview from './AttachmentPreview';

interface ComposerAddonsProps {
  replyTo?: Message | null;
  onReplyCancel?: () => void;
  editingMessage?: Message | null;
  onEditCancel?: () => void;
  attachments: OptimisticAttachment[];
  onAttachmentRemove: (id: string) => void;
  otherParticipantName?: string;
  currentUserId?: string;
}

export default function ComposerAddons({
  replyTo,
  onReplyCancel,
  editingMessage,
  onEditCancel,
  attachments,
  onAttachmentRemove,
  otherParticipantName,
  currentUserId,
}: ComposerAddonsProps) {
  if (!(replyTo || editingMessage) && attachments.length === 0) return null;

  return (
    <div
      className="px-4 py-2 bg-white/[0.01] border-b border-white/[0.04] space-y-2 overflow-hidden"
      style={{ willChange: 'transform' }}
    >
      <AnimatePresence mode="popLayout">
        {/* Editing Preview */}
        {editingMessage && (
          <motion.div
            key="editing-preview"
            initial={{ height: 0, opacity: 0, y: 10 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-3 py-1.5 border-l-2 border-yellow-500/60 px-3 bg-yellow-500/5 rounded-r-md relative group overflow-hidden"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">Редагування</p>
              <p className="text-xs text-gray-300 truncate mt-0.5">{editingMessage.content}</p>
            </div>
            <button
              type="button"
              onClick={onEditCancel}
              className="p-1 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}

        {/* Reply Preview */}
        {replyTo && (
          <motion.div
            key="reply-preview"
            initial={{ height: 0, opacity: 0, y: 10 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-3 py-1.5 border-l-2 border-[#5e6ad2] px-3 bg-[#5e6ad2]/5 rounded-r-md relative group overflow-hidden"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-[#8d96e9] uppercase tracking-wider">
                {currentUserId && replyTo.sender_id === currentUserId
                  ? 'Відповідь собі'
                  : `Відповідь ${otherParticipantName || 'користувачу'}`}
              </p>
              <p className="text-xs text-gray-300 truncate mt-0.5">{replyTo.content}</p>
            </div>
            <button
              type="button"
              onClick={onReplyCancel}
              className="p-1 hover:bg-white/5 rounded-md text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}

        {/* Attachments Preview */}
        {attachments.length > 0 && (
          <motion.div
            key="attachments-preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-hide pt-1"
          >
            <AnimatePresence>
              {attachments.map((attachment) => (
                <motion.div
                  key={attachment.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                >
                  <AttachmentPreview attachment={attachment} onRemove={onAttachmentRemove} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
