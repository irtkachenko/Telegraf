'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface ViewportDetectionResult {
  observeMessage: (messageId: string, element: HTMLElement) => void;
  unobserveMessage: (messageId: string) => void;
  isMessageVisible: (messageId: string) => boolean;
}

/**
 * Hook для відстеження видимості повідомлень в viewport через IntersectionObserver
 */
export function useViewportDetection(): ViewportDetectionResult {
  const visibleMessagesRef = useRef<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const messageElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  // Створюємо IntersectionObserver
  useEffect(() => {
    if (typeof window === 'undefined') return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const messageId = entry.target.getAttribute('data-message-id');
          if (!messageId) return;

          if (entry.isIntersecting) {
            visibleMessagesRef.current.add(messageId);
          } else {
            visibleMessagesRef.current.delete(messageId);
          }
        });
      },
      {
        threshold: 0.5, // 50% повідомлення має бути видимим
        rootMargin: '-50px 0px -50px 0px', // Враховуємо часткову видимість
      },
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Додаємо повідомлення для відстеження
  const observeMessage = useCallback((messageId: string, element: HTMLElement) => {
    if (!observerRef.current) return;

    // Встановлюємо data-атрибут для ідентифікації
    element.setAttribute('data-message-id', messageId);

    // Зберігаємо елемент для cleanup
    messageElementsRef.current.set(messageId, element);

    // Починаємо відстеження
    observerRef.current.observe(element);
  }, []);

  // Прибираємо повідомлення з відстеження
  const unobserveMessage = useCallback((messageId: string) => {
    const element = messageElementsRef.current.get(messageId);
    if (element && observerRef.current) {
      observerRef.current.unobserve(element);
      messageElementsRef.current.delete(messageId);
    }
  }, []);

  // Перевіряємо чи повідомлення видиме
  const isMessageVisible = useCallback((messageId: string) => {
    return visibleMessagesRef.current.has(messageId);
  }, []);

  // Cleanup при unmount
  useEffect(() => {
    const observer = observerRef.current;
    const elementsMap = messageElementsRef.current;
    const visibleSet = visibleMessagesRef.current;

    return () => {
      observer?.disconnect();
      elementsMap.clear();
      visibleSet.clear();
    };
  }, []);

  return {
    observeMessage,
    unobserveMessage,
    isMessageVisible,
  };
}
