'use client';

import { FileIcon, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import type { OptimisticAttachment } from '@/types';

interface AttachmentPreviewProps {
  attachment: OptimisticAttachment;
  onRemove: (id: string) => void;
}

export default function AttachmentPreview({ attachment, onRemove }: AttachmentPreviewProps) {
  const isImage = attachment.type === 'image';

  return (
    <div className="relative group w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
      {attachment.uploading && (
        <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        </div>
      )}

      {attachment.error && (
        <div className="absolute inset-0 z-10 bg-red-500/20 flex items-center justify-center p-1 text-[8px] text-red-200 text-center">
          Error
        </div>
      )}

      {isImage ? (
        <Image
          src={attachment.previewUrl}
          alt={attachment.metadata.name}
          fill
          sizes="80px"
          className="w-full h-full object-cover transition-transform group-hover:scale-110"
          unoptimized
        />
      ) : (
        <div className="flex flex-col items-center gap-1 p-2">
          <FileIcon className="w-8 h-8 text-blue-400" />
          <span className="text-[8px] text-gray-400 truncate w-full text-center">
            {attachment.metadata.name}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-red-500 z-20"
      >
        <X size={12} />
      </button>
    </div>
  );
}
