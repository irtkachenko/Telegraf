import { useCallback, useState } from 'react';
import { storageApi } from '@/services';
import { NetworkError } from '@/shared/lib/errors';

interface SignedUrlOptions {
  expiresIn?: number; // Default: from config
  download?: string;
  transform?: Record<string, string>;
}

interface UseStorageUrlReturn {
  getPublicUrl: (bucket: string, path: string, options?: SignedUrlOptions) => Promise<string>;
  getSignedUrl: (bucket: string, path: string, options?: SignedUrlOptions) => Promise<string>;
  getUrl: (bucket: string, path: string, options?: SignedUrlOptions) => Promise<string>;
  isLoading: boolean;
  error: Error | null;
}

import { storageConfig } from '@/config/storage.config';
import { useStorageStore } from '@/store/useStorageStore';

/**
 * Hook for handling storage URLs with automatic detection of private vs public buckets.
 * Integrated with useStorageStore for global caching and performance.
 */
export function useStorageUrl(): UseStorageUrlReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { urlCache, setUrl, setMediaState } = useStorageStore();

  const getPublicUrl = useCallback(
    async (bucket: string, path: string, options?: SignedUrlOptions): Promise<string> => {
      const cacheKey = `${bucket}:${path}`;
      const cached = urlCache[cacheKey];
      if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
      }

      const url = await storageApi.getPublicUrl(bucket, path, options);
      // Public URLs don't really expire the same way, but we cache for a day
      setUrl(cacheKey, { url, expiresAt: Date.now() + 86400000 });
      return url;
    },
    [urlCache, setUrl],
  );

  const getSignedUrl = useCallback(
    async (bucket: string, path: string, options?: SignedUrlOptions): Promise<string> => {
      const cacheKey = `${bucket}:${path}`;
      const cached = urlCache[cacheKey];
      if (cached && cached.expiresAt > Date.now() + 60000) {
        // 1 min buffer
        return cached.url;
      }

      const url = await storageApi.getSignedUrl(bucket, path, options);
      const expiresIn = options?.expiresIn || storageConfig.defaults.signedUrlExpiry;
      setUrl(cacheKey, { url, expiresAt: Date.now() + expiresIn * 1000 });
      return url;
    },
    [urlCache, setUrl],
  );

  const getUrl = useCallback(
    async (bucket: string, path: string, options?: SignedUrlOptions): Promise<string> => {
      const cacheKey = `${bucket}:${path}`;
      const cached = urlCache[cacheKey];

      // If we have a valid cache, return immediately without loading state
      if (cached && cached.expiresAt > Date.now() + 60000) {
        return cached.url;
      }

      setIsLoading(true);
      setError(null);

      // Update global state so components know we're fetching
      setMediaState(cacheKey, { isLoading: true, isLoaded: false, hasError: false });

      try {
        const url = await storageApi.getUrl(bucket, path, options);
        const expiresIn = options?.expiresIn || storageConfig.defaults.signedUrlExpiry;

        setUrl(cacheKey, { url, expiresAt: Date.now() + expiresIn * 1000 });
        setMediaState(cacheKey, { isLoaded: true, hasError: false, isLoading: false });

        return url;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setMediaState(cacheKey, { isLoaded: false, hasError: true, isLoading: false });

        throw new NetworkError(
          `Failed to get storage URL for ${bucket}/${path}`,
          `${bucket}/${path}`,
          'STORAGE_URL_ERROR',
          500,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [urlCache, setUrl, setMediaState],
  );

  return {
    getPublicUrl,
    getSignedUrl,
    getUrl,
    isLoading,
    error,
  };
}

export async function getStorageUrl(
  bucket: string,
  path: string,
  options?: SignedUrlOptions,
): Promise<string> {
  return await storageApi.getUrl(bucket, path, options);
}
