'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface MessageViewTimer {
  startViewing: (messageId: string) => void;
  stopViewing: (messageId: string) => void;
  getViewTime: (messageId: string) => number;
  isViewedLongEnough: (messageId: string, minTime: number) => boolean;
  clearTimers: () => void;
}

interface MessageTimer {
  startTime: number;
  totalTime: number;
  isViewing: boolean;
}

/**
 * Hook для відстеження часу перегляду повідомлень
 */
export function useMessageViewTimer(): MessageViewTimer {
  const timersRef = useRef<Map<string, MessageTimer>>(new Map());

  // Починаємо відстеження перегляду
  const startViewing = useCallback((messageId: string) => {
    const existing = timersRef.current.get(messageId);

    if (existing) {
      // Якщо вже відстежуємо, просто поновлюємо стан
      existing.isViewing = true;
      existing.startTime = Date.now();
    } else {
      // Створюємо новий таймер
      timersRef.current.set(messageId, {
        startTime: Date.now(),
        totalTime: 0,
        isViewing: true,
      });
    }
  }, []);

  // Припиняємо відстеження перегляду
  const stopViewing = useCallback((messageId: string) => {
    const timer = timersRef.current.get(messageId);
    if (!(timer && timer.isViewing)) return;

    const viewDuration = Date.now() - timer.startTime;
    timer.totalTime += viewDuration;
    timer.isViewing = false;

    // Cleanup якщо повідомлення переглянуто достатньо довго
    if (timer.totalTime > 60000) {
      // 1 хвилина
      timersRef.current.delete(messageId);
    }
  }, []);

  // Отримуємо загальний час перегляду
  const getViewTime = useCallback((messageId: string) => {
    const timer = timersRef.current.get(messageId);
    if (!timer) return 0;

    let totalTime = timer.totalTime;

    // Якщо зараз переглядаємо, додаємо поточну сесію
    if (timer.isViewing) {
      totalTime += Date.now() - timer.startTime;
    }

    return totalTime;
  }, []);

  // Перевіряємо чи достатньо часу переглянуто
  const isViewedLongEnough = useCallback(
    (messageId: string, minTime: number) => {
      const viewTime = getViewTime(messageId);
      return viewTime >= minTime;
    },
    [getViewTime],
  );

  // Очищуємо всі таймери
  const clearTimers = useCallback(() => {
    timersRef.current.clear();
  }, []);

  // Автоматичне очищення старих таймерів
  const cleanup = useCallback(() => {
    const now = Date.now();
    const toDelete: string[] = [];

    timersRef.current.forEach((timer, messageId) => {
      // Видаляємо таймери яким більше 5 хвилин і неактивні
      if (!timer.isViewing && now - timer.startTime > 300000) {
        toDelete.push(messageId);
      }
    });

    toDelete.forEach((messageId) => {
      timersRef.current.delete(messageId);
    });
  }, []);

  // Періодичне очищення
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    cleanupInterval.current = setInterval(cleanup, 30000); // Кожні 30 секунд

    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
        cleanupInterval.current = null;
      }
    };
  }, [cleanup]);

  return {
    startViewing,
    stopViewing,
    getViewTime,
    isViewedLongEnough,
    clearTimers,
  };
}
