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
      className="px-4 py-3 border-t border-white/5 backdrop-blur-md bg-white/5 space-y-2 overflow-hidden"
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
            className="flex items-center gap-3 py-2 border-s-4 border-amber-500 px-3 bg-amber-500/5 rounded-e-lg relative group overflow-hidden"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-400">Editing message</p>
              <p className="text-sm text-gray-300 truncate">{editingMessage.content}</p>
            </div>
            <button
              type="button"
              onClick={onEditCancel}
              className="p-1 hover:bg-white/10 rounded-full text-gray-400 transition-colors duration-300"
            >
              <X size={16} />
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
            className="flex items-center gap-3 py-2 border-s-4 border-blue-500 px-3 bg-blue-500/5 rounded-e-lg relative group overflow-hidden"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-400">
                {currentUserId && replyTo.sender_id === currentUserId
                  ? 'Reply to yourself'
                  : `Reply to ${otherParticipantName || 'user'}`}
              </p>
              <p className="text-sm text-gray-300 truncate">{replyTo.content}</p>
            </div>
            <button
              type="button"
              onClick={onReplyCancel}
              className="p-1 hover:bg-white/10 rounded-full text-gray-400 transition-colors duration-300"
            >
              <X size={16} />
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
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
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
