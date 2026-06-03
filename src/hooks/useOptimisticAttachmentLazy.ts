'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { getMaxFilesPerMessage } from '@/config/upload.config';
import { handleError } from '@/shared/lib/error-handler';
import { AuthError, ValidationError } from '@/shared/lib/errors';
import type { Attachment } from '@/types';
import { useStorageLimits } from './useDynamicStorageConfig';

export interface LazyAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'video' | 'file';
  metadata: { name: string; size: number };
  error?: string;
}

/**
 * Hook for working with files without instant upload
 * Files are prepared for sending, but uploaded only when message is sent
 */
export function useOptimisticAttachmentLazy() {
  const [attachments, setAttachments] = useState<LazyAttachment[]>([]);
  const { user } = useSupabaseAuth();
  const { validateFile, getMaxTotalSize, getMaxFileSize } = useStorageLimits();

  // Constants for limits
  const MAX_FILES_PER_MESSAGE = getMaxFilesPerMessage();
  // Note: max total size comes from Supabase Storage API via useStorageLimits

  // Cleanup preview URLs on component unmount
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
  }, [attachments]);

  const addFile = async (file: File): Promise<LazyAttachment | null> => {
    if (!user) {
      handleError(
        new AuthError('You are not authorized', 'UPLOAD_AUTH_REQUIRED', 401),
        'OptimisticAttachmentLazy',
      );
      return null;
    }

    // File validation
    const validation = validateFile(file);
    if (!validation.valid) {
      handleError(
        new ValidationError(
          validation.error || 'File validation error',
          'file',
          'FILE_VALIDATION_ERROR',
          400,
        ),
        'OptimisticAttachmentLazy',
      );
      return null;
    }

    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);

    // Determine file type based on MIME type
    let type: 'image' | 'video' | 'file';
    if (file.type.startsWith('image/')) {
      type = 'image';
    } else if (file.type.startsWith('video/')) {
      type = 'video';
    } else {
      type = 'file';
    }

    const newAttachment: LazyAttachment = {
      id,
      file,
      previewUrl,
      type,
      metadata: { name: file.name, size: file.size },
    };

    setAttachments((prev) => [...prev, newAttachment]);
    return newAttachment;
  };

  const addFiles = async (files: File[]): Promise<LazyAttachment[]> => {
    const validFiles: File[] = [];
    const rejectedByType: File[] = [];
    const rejectedBySize: File[] = [];

    // Check each file individually — separate type errors from size errors
    for (const file of files) {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else if (
        validation.error?.includes('too large') ||
        validation.error?.includes('Maximum size')
      ) {
        rejectedBySize.push(file);
      } else {
        rejectedByType.push(file);
      }
    }

    // Check limits WHEN ADDING files
    const currentFilesCount = attachments.length;
    const currentTotalSize = attachments.reduce((sum, a) => sum + a.metadata.size, 0);

    const allowedFiles: File[] = [];
    const rejectedByCount: File[] = [];
    const rejectedByTotalSize: File[] = [];

    // Calculate how many files can be added
    const remainingSlots = MAX_FILES_PER_MESSAGE - currentFilesCount;
    const MAX_TOTAL_SIZE = getMaxTotalSize();
    const remainingSize = MAX_TOTAL_SIZE - currentTotalSize;

    let addedSize = 0;
    for (const file of validFiles) {
      if (allowedFiles.length >= remainingSlots) {
        rejectedByCount.push(file);
        continue;
      }

      if (addedSize + file.size > remainingSize) {
        rejectedByTotalSize.push(file);
      } else {
        allowedFiles.push(file);
        addedSize += file.size;
      }
    }

    // Show toast for unsupported file types
    if (rejectedByType.length > 0) {
      const rejectedNames = rejectedByType.map((f) => f.name).join(', ');
      toast.error(`File type not supported. Not added: ${rejectedNames}`);
    }

    // Show toast for files that exceed individual size limit
    if (rejectedBySize.length > 0) {
      const rejectedNames = rejectedBySize.map((f) => f.name).join(', ');
      const maxSizeMB = Math.round(getMaxFileSize('images') / 1024 / 1024);
      toast.error(`File too large (max ${maxSizeMB}MB). Not added: ${rejectedNames}`);
    }

    // Show toast for exceeding file count limit
    if (rejectedByCount.length > 0) {
      const rejectedNames = rejectedByCount.map((f) => f.name).join(', ');
      toast.error(
        `Too many files. Maximum ${MAX_FILES_PER_MESSAGE} per message. Not added: ${rejectedNames}`,
      );
    }

    // Show toast for exceeding total size limit
    if (rejectedByTotalSize.length > 0) {
      const rejectedNames = rejectedByTotalSize.map((f) => f.name).join(', ');
      const maxTotalMB = Math.round(MAX_TOTAL_SIZE / 1024 / 1024);
      toast.error(`Total attachment size limit is ${maxTotalMB}MB. Not added: ${rejectedNames}`);
    }

    // Add only allowed files (valid files that passed all limits)
    if (allowedFiles.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(allowedFiles.map((file) => addFile(file)));
    return results
      .filter(
        (result): result is PromiseFulfilledResult<LazyAttachment> =>
          result.status === 'fulfilled' && result.value !== null,
      )
      .map((result) => result.value);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const clearAttachments = () => {
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  };

  const getFilesForUpload = (): File[] => {
    return attachments.map((a) => a.file);
  };

  const getOptimisticAttachments = (): Attachment[] => {
    return attachments.map(({ previewUrl, ...attachment }) => ({
      ...attachment,
      url: previewUrl,
      uploading: false, // Will be set to true when sending
    }));
  };

  const hasAttachments = attachments.length > 0;
  const totalSize = attachments.reduce((sum, a) => sum + a.metadata.size, 0);

  return {
    attachments,
    addFile,
    addFiles,
    removeAttachment,
    clearAttachments,
    getFilesForUpload,
    getOptimisticAttachments,
    hasAttachments,
    totalSize,
  };
}
