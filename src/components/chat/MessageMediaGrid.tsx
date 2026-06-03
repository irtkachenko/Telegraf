'use client';

import { FileX, ImageOff, PlayCircle } from 'lucide-react';
import Image from 'next/image';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { storageConfig } from '@/config/storage.config';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { extractStorageRef } from '@/lib/storage-utils';
import { cn } from '@/lib/utils';
import { useStorageStore } from '@/store/useStorageStore';
import type { Attachment } from '@/types';

const ImageModal = lazy(() => import('./ImageModal'));

interface MessageMediaGridProps {
  items: Attachment[];
  onMediaSettled?: () => void;
}

interface AttachmentWithUrl extends Attachment {
  processedUrl?: string;
}

interface MediaState {
  isLoading: boolean;
  hasError: boolean;
  isLoaded: boolean;
}

const MediaPlaceholder = ({
  reason = 'deleted',
  isLoading = false,
}: {
  reason?: 'deleted' | 'error';
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center z-10 min-h-[150px]">
        <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Завантаження...
        </p>
      </div>
    );
  }

  const Icon = reason === 'deleted' ? FileX : ImageOff;
  const text = reason === 'deleted' ? 'Видалено' : 'Помилка';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center z-10 min-h-[150px]">
      <Icon className="w-5 h-5 text-neutral-500 mb-2" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{text}</p>
    </div>
  );
};

export default function MessageMediaGrid({ items, onMediaSettled }: MessageMediaGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Zustand store
  const { urlCache, failedUrls, setUrl, addFailedUrl, removeFailedUrl } = useStorageStore();

  const { getUrl } = useStorageUrl();
  // Simple media states map instead of complex refs
  const [localMediaStates, setLocalMediaStates] = useState<Map<string, MediaState>>(new Map());

  // Simplified URL resolution - no periodic refresh, no debouncing
  useEffect(() => {
    if (!items || items.length === 0) return;

    const now = Date.now();
    const expiryMs = storageConfig.defaults.signedUrlExpiry * 1000;
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

    items.forEach(async (item) => {
      const cacheKey = `${item.id}:${item.url}`;
      const originalUrl = item.url;

      // Skip blob URLs and deleted items
      if (originalUrl.startsWith('blob:') || item.is_deleted) return;

      // Check if we need to refresh URL
      const cached = urlCache[cacheKey];
      const needsRefresh = !cached || cached.expiresAt - now <= bufferMs;

      if (!needsRefresh) return;

      // Skip if already failed
      if (failedUrls.has(originalUrl)) return;

      // Set loading state
      setLocalMediaStates((prev) =>
        new Map(prev).set(cacheKey, {
          isLoading: true,
          hasError: false,
          isLoaded: false,
        }),
      );

      const ref = extractStorageRef(originalUrl);
      if (!ref) return;

      try {
        const resolvedUrl = await getUrl(ref.bucket, ref.path);
        const cacheData = { url: resolvedUrl, expiresAt: Date.now() + expiryMs };
        setUrl(cacheKey, cacheData);

        removeFailedUrl(originalUrl);
        setLocalMediaStates((prev) =>
          new Map(prev).set(cacheKey, {
            isLoading: false,
            hasError: false,
            isLoaded: true,
          }),
        );
      } catch {
        addFailedUrl(originalUrl);
        setLocalMediaStates((prev) =>
          new Map(prev).set(cacheKey, {
            isLoading: false,
            hasError: true,
            isLoaded: false,
          }),
        );
      }
    });
  }, [items, getUrl, urlCache, setUrl, addFailedUrl, removeFailedUrl, failedUrls]);

  // Process attachment URLs for rendering
  const processedItems = useMemo(() => {
    if (!items || items.length === 0) {
      return [];
    }

    return items.map((item) => {
      const cacheKey = `${item.id}:${item.url}`;
      const cached = urlCache[cacheKey];

      if (cached) {
        return { ...item, processedUrl: cached.url };
      }

      return { ...item, processedUrl: item.url };
    });
  }, [items, urlCache]);

  const handleImageError = useCallback(
    (url: string) => {
      addFailedUrl(url);
      // Update all media states that share this URL (unlikely but safe)
      const updatedStates = new Map(localMediaStates);
      Object.keys(Object.fromEntries(updatedStates)).forEach((key) => {
        if (key.includes(url)) {
          updatedStates.set(key, { isLoading: false, hasError: true, isLoaded: false });
        }
      });
      setLocalMediaStates(updatedStates);
      onMediaSettled?.();
    },
    [addFailedUrl, localMediaStates, onMediaSettled],
  );

  const handleImageLoad = useCallback(
    (url: string) => {
      const updatedStates = new Map(localMediaStates);
      Object.keys(Object.fromEntries(updatedStates)).forEach((key) => {
        if (key.includes(url)) {
          updatedStates.set(key, { isLoading: false, hasError: false, isLoaded: true });
        }
      });
      setLocalMediaStates(updatedStates);
      onMediaSettled?.();
    },
    [localMediaStates, onMediaSettled],
  );

  const handleImageLoadStart = useCallback(
    (url: string) => {
      const updatedStates = new Map(localMediaStates);
      Object.keys(Object.fromEntries(updatedStates)).forEach((key) => {
        if (key.includes(url)) {
          updatedStates.set(key, { isLoading: true, hasError: false, isLoaded: false });
        }
      });
      setLocalMediaStates(updatedStates);
    },
    [localMediaStates],
  );

  const activeMedia = useMemo(
    () =>
      processedItems.filter(
        (item) => !(item.is_deleted || failedUrls.has(item.processedUrl || item.url)),
      ),
    [processedItems, failedUrls],
  );
  const activeCount = items.length; // Використовуємо повну кількість для стабільної сітки

  const handleMediaClick = useCallback(
    (index: number) => {
      const clickedItem = processedItems[index];

      if (clickedItem.is_deleted || failedUrls.has(clickedItem.processedUrl || clickedItem.url)) {
        return;
      }

      const activeIndex = activeMedia.findIndex((m) => m.id === clickedItem.id);

      if (activeIndex !== -1) {
        setSelectedIndex(activeIndex);
      }
    },
    [processedItems, failedUrls, activeMedia],
  );

  const modalImages = useMemo(
    () =>
      activeMedia
        .filter((item) => item.type === 'image' || item.type === 'video')
        .map((item) => ({ ...item, url: item.processedUrl || item.url })),
    [activeMedia],
  );

  const renderItem = useCallback(
    (item: AttachmentWithUrl, index: number, layoutClass: string) => {
      const itemUrl = item.processedUrl || item.url;
      const cacheKey = `${item.id}:${item.url}`;
      const mediaState = localMediaStates.get(cacheKey) || {
        isLoading: false,
        hasError: false,
        isLoaded: false,
      };
      const isFailed = failedUrls.has(itemUrl) || item.is_deleted || mediaState.hasError;

      // Показуємо заглушку, якщо вантажиться або якщо сталася помилка
      const shouldShowPlaceholder = mediaState.isLoading || isFailed || item.uploading;

      // Показуємо контент тільки якщо немає помилок і завантаження завершено
      const shouldShowContent = !shouldShowPlaceholder;

      return (
        <div
          key={item.id}
          className={cn(
            'relative overflow-hidden group bg-neutral-200 dark:bg-neutral-800',
            layoutClass,
          )}
        >
          {shouldShowPlaceholder && (
            <MediaPlaceholder
              reason={isFailed ? 'error' : 'deleted'}
              isLoading={mediaState.isLoading || item.uploading}
            />
          )}
          {shouldShowContent && (
            <button
              type="button"
              className="w-full h-full relative block"
              onClick={() => handleMediaClick(index)}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full relative bg-black">
                  <video
                    src={itemUrl}
                    className="w-full h-full object-cover text-white"
                    onLoadedData={() => handleImageLoad(itemUrl)}
                    onError={() => handleImageError(itemUrl)}
                  >
                    <track kind="captions" />
                  </video>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                    <PlayCircle className="w-10 h-10 text-white/80" />
                  </div>
                </div>
              ) : (
                <Image
                  src={itemUrl}
                  alt=""
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  unoptimized
                  onLoadStart={() => handleImageLoadStart(itemUrl)}
                  onLoad={() => handleImageLoad(itemUrl)}
                  onError={() => handleImageError(itemUrl)}
                  sizes="(max-width: 768px) 280px, 400px"
                />
              )}
              {index === 3 && activeCount > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white z-10">
                  <span className="text-xl font-bold">+{activeCount - 4}</span>
                </div>
              )}
            </button>
          )}
        </div>
      );
    },
    [
      failedUrls,
      handleMediaClick,
      handleImageLoad,
      handleImageError,
      handleImageLoadStart,
      activeCount,
      localMediaStates,
    ],
  );

  return (
    <>
      <div
        className={cn('grid gap-1 overflow-hidden rounded-2xl w-full', {
          'w-[400px] max-w-full max-sm:w-[280px]': activeCount === 1,
          'w-[350px] max-w-full max-sm:w-[250px]': activeCount === 2,
          'w-[320px] max-w-full max-sm:w-[220px]': activeCount === 3,
          'w-[300px] max-w-full max-sm:w-[200px]': activeCount >= 4,
        })}
      >
        {activeCount === 1 && (
          <div
            className="relative overflow-hidden bg-neutral-200 dark:bg-neutral-800 rounded-2xl"
            style={{
              aspectRatio:
                processedItems[0].metadata?.width && processedItems[0].metadata?.height
                  ? `${processedItems[0].metadata.width}/${processedItems[0].metadata.height}`
                  : '16/10',
              maxHeight: '500px',
            }}
          >
            {(() => {
              const item = processedItems[0];
              const itemUrl = item.processedUrl || item.url;
              const cacheKey = `${item.id}:${item.url}`;
              const mediaState = localMediaStates.get(cacheKey) || {
                isLoading: false,
                hasError: false,
                isLoaded: false,
              };
              const isFailed = failedUrls.has(itemUrl) || item.is_deleted || mediaState.hasError;

              // Показуємо заглушку, якщо вантажиться або якщо сталася помилка
              const shouldShowPlaceholder =
                (mediaState.isLoading && !item.url.startsWith('blob:')) ||
                isFailed ||
                item.uploading;

              // Показуємо контент: або коли успішно завантажено, або якщо це blob (оптимістичний UI)
              // АЛЕ при завантаженні blob (uploading) ми не показуємо контент взагалі
              const shouldShowContent = !shouldShowPlaceholder;

              return (
                <>
                  {shouldShowPlaceholder && (
                    <MediaPlaceholder
                      reason={isFailed ? 'error' : 'deleted'}
                      isLoading={mediaState.isLoading || item.uploading}
                    />
                  )}
                  {shouldShowContent && (
                    <button
                      type="button"
                      onClick={() => handleMediaClick(0)}
                      className="w-full h-full relative block"
                    >
                      {item.type === 'video' ? (
                        <video
                          src={itemUrl}
                          className="w-full h-full object-contain bg-black"
                          onLoadedData={() => handleImageLoad(itemUrl)}
                          onError={() => handleImageError(itemUrl)}
                        >
                          <track kind="captions" />
                        </video>
                      ) : (
                        <Image
                          src={itemUrl}
                          alt=""
                          fill
                          className="object-contain bg-neutral-900/10"
                          unoptimized
                          onLoadStart={() => handleImageLoadStart(itemUrl)}
                          onLoad={() => handleImageLoad(itemUrl)}
                          onError={() => handleImageError(itemUrl)}
                          sizes="(max-width: 768px) 280px, 400px"
                        />
                      )}

                      {/* Loader overlay for uploading or initial loading */}
                      {(item.uploading ||
                        (mediaState.isLoading && !item.url.startsWith('blob:'))) && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
                          <div className="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-2" />
                          {item.uploading && (
                            <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">
                              Надсилаємо...
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {activeCount === 2 && (
          <div className="grid grid-cols-2 gap-1">
            {processedItems.map((item, i) => renderItem(item, i, 'aspect-square'))}
          </div>
        )}

        {activeCount === 3 && (
          <div className="grid grid-cols-2 gap-1">
            {renderItem(processedItems[0], 0, 'col-span-2 aspect-video')}
            {renderItem(processedItems[1], 1, 'aspect-square')}
            {renderItem(processedItems[2], 2, 'aspect-square')}
          </div>
        )}

        {activeCount >= 4 && (
          <div className="grid grid-cols-2 gap-1">
            {processedItems.slice(0, 4).map((item, i) => renderItem(item, i, 'aspect-square'))}
          </div>
        )}
      </div>

      <Suspense fallback={<div className="hidden" />}>
        <ImageModal
          isOpen={selectedIndex !== null}
          images={modalImages}
          initialIndex={selectedIndex ?? 0}
          onClose={() => setSelectedIndex(null)}
        />
      </Suspense>
    </>
  );
}
