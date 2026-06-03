'use client';

import { PlayCircle } from 'lucide-react';
import Image from 'next/image';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { storageConfig } from '@/config/storage.config';
import { useStorageUrl } from '@/hooks/useStorageUrl';
import { extractStorageRef } from '@/lib/storage-utils';
import { cn } from '@/lib/utils';
import { useStorageStore } from '@/store/useStorageStore';
import type { Attachment } from '@/types';
import { MediaPlaceholder } from './MediaPlaceholder';

const ImageModal = lazy(() => import('./ImageModal'));

interface MessageMediaGridProps {
  items: Attachment[];
  onMediaSettled?: () => void;
}

interface AttachmentWithUrl extends Attachment {
  processedUrl?: string;
}

function getState(
  urlCache: Record<string, { url: string; expiresAt: number }>,
  mediaStates: Record<string, { isLoading: boolean; hasError: boolean; isLoaded: boolean }>,
  failedUrls: Set<string>,
  item: Attachment,
): { cacheKey: string; itemUrl: string; isFailed: boolean; isLoading: boolean } {
  const cacheKey = `${item.id}:${item.url}`;
  const cached = urlCache[cacheKey];
  const itemUrl = cached?.url || item.url;
  const state = mediaStates[cacheKey];
  const isLoading = state?.isLoading ?? false;
  const isFailed = item.is_deleted === true || failedUrls.has(itemUrl) || state?.hasError === true;
  return { cacheKey, itemUrl, isFailed, isLoading };
}

export default function MessageMediaGrid({ items, onMediaSettled }: MessageMediaGridProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const { urlCache, mediaStates, failedUrls, setUrl, addFailedUrl, removeFailedUrl, setMediaState } = useStorageStore();
  const { getUrl } = useStorageUrl();

  // URL resolution effect
  useEffect(() => {
    if (!items || items.length === 0) return;

    const now = Date.now();
    const expiryMs = storageConfig.defaults.signedUrlExpiry * 1000;
    const bufferMs = 5 * 60 * 1000;

    items.forEach(async (item) => {
      const { cacheKey, itemUrl } = getState(urlCache, mediaStates, failedUrls, item);

      if (itemUrl.startsWith('blob:') || item.is_deleted) return;

      const cached = urlCache[cacheKey];
      const needsRefresh = !cached || cached.expiresAt - now <= bufferMs;
      if (!needsRefresh) return;

      if (failedUrls.has(itemUrl)) return;

      const ref = extractStorageRef(item.url);
      if (!ref) return;

      setMediaState(cacheKey, { isLoading: true });

      try {
        const resolvedUrl = await getUrl(ref.bucket, ref.path);
        setUrl(cacheKey, { url: resolvedUrl, expiresAt: Date.now() + expiryMs });
        removeFailedUrl(itemUrl);
        setMediaState(cacheKey, { isLoading: false, isLoaded: true });
      } catch {
        addFailedUrl(itemUrl);
        setMediaState(cacheKey, { isLoading: false, hasError: true });
      }
    });
  }, [items, getUrl, urlCache, setUrl, addFailedUrl, removeFailedUrl, failedUrls, setMediaState]);

  // Process items with cached URLs
  const processedItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    return items.map((item) => {
      const { cacheKey, itemUrl, isLoading } = getState(urlCache, mediaStates, failedUrls, item);
      return { ...item, processedUrl: itemUrl, _isLoading: isLoading } as AttachmentWithUrl & { _isLoading: boolean };
    });
  }, [items, urlCache, mediaStates, failedUrls]);

  const activeMedia = useMemo(
    () =>
      processedItems.filter(
        (item) => !(item.is_deleted || failedUrls.has(item.processedUrl || item.url)),
      ),
    [processedItems, failedUrls],
  );
  const activeCount = items.length;

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
    (item: AttachmentWithUrl, index: number, className: string) => {
      const { itemUrl, isFailed, isLoading } = getState(urlCache, mediaStates, failedUrls, item);
      const showOverlay = item.uploading;
      const isClickable = !isFailed && !showOverlay;
      const showPlaceholder = isLoading || isFailed;

      return (
        <div key={item.id} className={cn('relative overflow-hidden group bg-neutral-200 dark:bg-neutral-800', className)}>
          {showPlaceholder && (
            <MediaPlaceholder reason={isFailed ? 'error' : 'deleted'} isLoading={isLoading} />
          )}
          {!showPlaceholder && (
            <button type="button" className="w-full h-full relative block" onClick={() => isClickable && handleMediaClick(index)} disabled={!isClickable}>
              {item.type === 'video' ? (
                <div className="w-full h-full relative bg-black">
                  <video src={itemUrl} className="w-full h-full object-contain bg-black">
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
                  onLoad={() => onMediaSettled?.()}
                  onError={() => { addFailedUrl(itemUrl); onMediaSettled?.(); }}
                  sizes="(max-width: 768px) 280px, 400px"
                />
              )}

              {showOverlay && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-2" />
                  <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">
                    Надсилаємо...
                  </span>
                </div>
              )}

              {index === 3 && activeCount > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white z-10 pointer-events-none">
                  <span className="text-xl font-bold">+{activeCount - 4}</span>
                </div>
              )}
            </button>
          )}
        </div>
      );
    },
    [urlCache, mediaStates, failedUrls, handleMediaClick, onMediaSettled, addFailedUrl, activeCount],
  );

  // Single item layout with aspect ratio
  const singleItem = processedItems[0] as (AttachmentWithUrl & { _isLoading?: boolean }) | undefined;
  const singleState = singleItem ? getState(urlCache, mediaStates, failedUrls, singleItem) : null;
  const singleItemUrl = singleState?.itemUrl ?? '';
  const singleIsFailed = singleState?.isFailed ?? false;
  const singleIsLoading = singleState?.isLoading ?? false;
  const singleIsUploading = singleItem?.uploading ?? false;
  const showSinglePlaceholder = singleIsLoading || singleIsFailed;

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
        {activeCount === 1 && singleItem && (
          <div
            className="relative overflow-hidden bg-neutral-200 dark:bg-neutral-800 rounded-2xl"
            style={{
              aspectRatio:
                singleItem.metadata?.width && singleItem.metadata?.height
                  ? `${singleItem.metadata.width}/${singleItem.metadata.height}`
                  : '16/10',
              maxHeight: '500px',
            }}
          >
            {showSinglePlaceholder ? (
              <MediaPlaceholder reason={singleIsFailed ? 'error' : 'deleted'} isLoading={singleIsLoading} />
            ) : (
              <button type="button" onClick={() => handleMediaClick(0)} className="w-full h-full relative block">
                {singleItem.type === 'video' ? (
                  <video src={singleItemUrl} className="w-full h-full object-contain bg-black">
                    <track kind="captions" />
                  </video>
                ) : (
                  <Image
                    src={singleItemUrl}
                    alt=""
                    fill
                    className="object-contain bg-neutral-900/10"
                    unoptimized
                    onLoad={() => onMediaSettled?.()}
                    onError={() => { addFailedUrl(singleItemUrl); onMediaSettled?.(); }}
                    sizes="(max-width: 768px) 280px, 400px"
                  />
                )}

                {singleIsUploading && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-10">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-2" />
                    <span className="text-[10px] text-white/70 font-bold uppercase tracking-widest">
                      Надсилаємо...
                    </span>
                  </div>
                )}
              </button>
            )}
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