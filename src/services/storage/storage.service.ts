import type { StorageConfigResponse } from '@/config/storage.config';
import { storageConfig } from '@/config/storage.config';
import { supabase } from '@/lib/supabase/client';
import { handleError } from '@/shared/lib/error-handler';
import { NetworkError } from '@/shared/lib/errors';
import type { Attachment } from '@/types';

interface SignedUrlOptions {
  expiresIn?: number;
  download?: string;
  transform?: Record<string, string>;
}

export const storageApi = {
  /**
   * Get public URL
   */
  getPublicUrl: async (bucket: string, path: string, options?: SignedUrlOptions) => {
    try {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
        download: options?.download,
        transform: options?.transform,
      });
      return data.publicUrl;
    } catch (err) {
      const error = new NetworkError(
        `Failed to get public URL for ${bucket}/${path}: ${err}`,
        'storage',
        'PUBLIC_URL_ERROR',
        500,
      );
      handleError(error, 'StorageApi.getPublicUrl');
      throw error;
    }
  },

  /**
   * Get signed URL for private files
   */
  getSignedUrl: async (bucket: string, path: string, options?: SignedUrlOptions) => {
    const { data, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, options?.expiresIn ?? 3600, {
        download: options?.download,
        transform: options?.transform,
      });

    if (signedUrlError) {
      const error = new NetworkError(
        `Failed to create signed URL: ${signedUrlError.message}`,
        'storage',
        'SIGNED_URL_ERROR',
        signedUrlError.status || 500,
      );

      handleError(error, 'StorageApi.getSignedUrl');
      throw error;
    }

    return data.signedUrl;
  },

  /**
   * Auto-detect URL type (public or signed)
   */
  getUrl: async (bucket: string, path: string, options?: SignedUrlOptions) => {
    try {
      // Check if bucket is private (attachments bucket is private by default)
      const isPrivate = bucket === storageConfig.bucketNames.attachments;

      if (isPrivate) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, options?.expiresIn ?? storageConfig.defaults.signedUrlExpiry, {
            download: options?.download,
            transform: options?.transform,
          });

        if (error) {
          const networkError = new NetworkError(
            `Failed to create signed URL: ${error.message}`,
            'storage',
            'SIGNED_URL_ERROR',
            error.status || 500,
          );

          handleError(networkError, 'StorageApi.getUrl');
          throw networkError;
        }

        return data.signedUrl;
      } else {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path, {
          download: options?.download,
          transform: options?.transform,
        });

        return data.publicUrl;
      }
    } catch (err) {
      const error = new NetworkError(
        `Failed to get URL for ${bucket}/${path}: ${err}`,
        'storage',
        'GET_URL_ERROR',
        500,
      );
      handleError(error, 'StorageApi.getUrl');
      throw error;
    }
  },

  /**
   * Upload file
   */
  uploadFile: async (
    bucket: string,
    path: string,
    file: File,
    options?: {
      cacheControl?: string;
      upsert?: boolean;
    },
  ) => {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: options?.cacheControl || '3600',
      upsert: options?.upsert,
    });

    if (error) throw error;
  },

  /**
   * Remove files from storage (best-effort cleanup)
   */
  deleteFiles: async (bucket: string, paths: string[]) => {
    if (paths.length === 0) return;
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  },

  /**
   * Upload attachment with optimistic update
   */
  uploadAttachment: async (file: File, chatId: string, userId: string) => {
    const fileExt = file.name.split('.').pop() || 'bin';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const fileName = `${timestamp}-${randomSuffix}.${fileExt}`;
    const filePath = `${chatId}/${userId}/${fileName}`;

    // Upload file with upsert: true to handle duplicates
    await storageApi.uploadFile('attachments', filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });

    // Get signed URL for private bucket
    const signedUrl = await storageApi.getSignedUrl('attachments', filePath);

    const attachment: Attachment = {
      id: `attachment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: signedUrl,
      type: file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'file',
      is_deleted: false,
      metadata: {
        name: file.name,
        size: file.size,
      },
    };

    return attachment;
  },

  /**
   * Get dynamic storage configuration
   */
  getStorageConfig: async (): Promise<StorageConfigResponse> => {
    const response = await fetch('/api/storage/config');
    if (!response.ok) {
      throw new NetworkError(
        'Failed to get storage config',
        'storage',
        'CONFIG_ERROR',
        response.status,
      );
    }
    return response.json();
  },
};
