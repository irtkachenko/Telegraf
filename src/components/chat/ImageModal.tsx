'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronLeft, ChevronRight, Download, ImageOff, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/types';

interface ImageModalProps {
  isOpen: boolean;
  images: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

function ImageModalContent({ isOpen, images, initialIndex, onClose }: ImageModalProps) {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [hasError, setHasError] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD_PX = 45;

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleNext = useCallback(
    (e?: React.MouseEvent | KeyboardEvent) => {
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
      }

      if (currentIndex < images.length - 1) {
        setDirection(1);
        setCurrentIndex((prev) => prev + 1);
        setHasError(false);
      }
    },
    [currentIndex, images.length],
  );

  const handlePrev = useCallback(
    (e?: React.MouseEvent | KeyboardEvent) => {
      if (e && 'stopPropagation' in e) {
        e.stopPropagation();
      }

      if (currentIndex > 0) {
        setDirection(-1);
        setCurrentIndex((prev) => prev - 1);
        setHasError(false);
      }
    },
    [currentIndex],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    },
    [handleNext, handlePrev],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext(e);
      if (e.key === 'ArrowLeft') handlePrev(e);
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen, onClose, handleNext, handlePrev]);

  const variants = useMemo(
    () => ({
      enter: (dir: number) => ({
        x: dir > 0 ? 300 : dir < 0 ? -300 : 0,
        opacity: 0,
        scale: 0.95,
      }),
      center: {
        zIndex: 1,
        x: 0,
        opacity: 1,
        scale: 1,
      },
      exit: (dir: number) => ({
        zIndex: 0,
        x: dir < 0 ? 300 : dir > 0 ? -300 : 0,
        opacity: 0,
        scale: 0.95,
      }),
    }),
    [],
  );

  if (!mounted) {
    return <div className="hidden" />;
  }

  const currentImage = images[currentIndex];

  const modalContent = (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md"
          onClick={onClose}
        >
          <div className="absolute top-0 left-0 right-0 h-20 px-6 flex items-center justify-between z-[10000] bg-gradient-to-b from-black/50 to-transparent">
            <div className="flex flex-col text-white">
              <span className="font-medium truncate max-w-[200px] sm:max-w-md text-sm">
                {currentImage?.metadata?.name || 'Image'}
              </span>
              <span className="text-white/40 text-[11px] uppercase tracking-wider">
                {currentIndex + 1} of {images.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!hasError && currentImage?.url && (
                <a
                  href={currentImage.url}
                  download={currentImage.metadata?.name || 'image'}
                  onClick={(e) => e.stopPropagation()}
                  className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                >
                  <Download size={20} />
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all shadow-xl"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div
            className="relative flex-1 flex items-center justify-center p-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={(e) => handlePrev(e)}
                className="absolute left-4 z-[10001] p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all backdrop-blur-sm border border-white/10"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={variants}
                initial={direction === 0 ? { opacity: 0, scale: 0.9 } : 'enter'}
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                className="relative w-full h-full flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {!hasError && currentImage?.url ? (
                  <Image
                    src={currentImage.url}
                    alt="Gallery"
                    fill
                    sizes="100vw"
                    className="object-contain select-none"
                    priority
                    unoptimized
                    onError={() => setHasError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 text-white/50 bg-white/5 p-12 rounded-3xl border border-white/10 backdrop-blur-sm">
                    <div className="relative">
                      <ImageOff className="w-16 h-16 opacity-20" />
                      <AlertCircle className="w-8 h-8 text-red-500 absolute -bottom-1 -right-1" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium text-white/80 uppercase tracking-tight">
                        Media not available
                      </p>
                      <p className="text-sm text-white/40 mt-1">
                        The file has been deleted or expired
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {currentIndex < images.length - 1 && (
              <button
                type="button"
                onClick={(e) => handleNext(e)}
                className="absolute right-4 z-[10001] p-3 rounded-full bg-white/5 hover:bg-white/10 text-white transition-all backdrop-blur-sm border border-white/10"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>

          <div className="h-20 px-6 flex items-center justify-center gap-2 z-[10000]">
            {images.length > 1 &&
              images.map((img, idx) => (
                <div
                  key={img.id}
                  className={cn(
                    'h-1.5 transition-all duration-300 rounded-full',
                    idx === currentIndex ? 'w-8 bg-blue-500' : 'w-1.5 bg-white/20',
                  )}
                />
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}

export default function ImageModal(props: ImageModalProps) {
  const remountKey = `${props.initialIndex}-${props.isOpen ? 'open' : 'closed'}`;
  return <ImageModalContent key={remountKey} {...props} />;
}
