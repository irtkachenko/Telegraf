'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { realtimeApi } from '@/services/realtime/realtime.service';

// Час між broadcast-повідомленнями "друкую..." (тротлінг).
const TYPING_THROTTLE_MS = 1000;

// Сторона відправника: якщо користувач перестав друкувати, але setTyping(false)
// не викликався, надіслати "не друкує" через цей час.
const TYPING_AUTO_CLEAR_MS = 2000;

// Сторона отримувача: страхувальний таймер, який примусово ховає індикатор,
// якщо нових "друкую..." не надходило протягом цього часу.
const TYPING_STALE_MS = 8000;

/**
 * Хук для подій чату (typing indicator) через Broadcast.
 *
 * Broadcast — миттєвий fire-and-forget механізм: повідомлення летить усім
 * підписникам каналу одразу, без проміжного збереження стану на сервері.
 * На відміну від Presence (sync через сервер), це прибирає помітну затримку
 * появи/зникнення індикатора.
 */
export function useChatEvents(chatId: string, user: User | null) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<number>(0);
  const userIdRef = useRef<string | null>(null);
  // Receiver-side safety net: per-user timers that force-clear the typing
  // indicator if no typing update arrives within TYPING_STALE_MS.
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Update userId ref when user changes
  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user?.id]);

  const handleTypingBroadcast = useCallback((payload: { payload: Record<string, unknown> }) => {
    const rawUserId = payload.payload?.['user_id'];
    const senderId = typeof rawUserId === 'string' ? rawUserId : null;
    if (!senderId || senderId === userIdRef.current) return;

    const isTyping = payload.payload?.['isTyping'] === true;
    const timeouts = typingTimeoutsRef.current;

    if (isTyping) {
      // Додаємо користувача в набір тих, хто друкує.
      setTypingUsers((prev) => {
        if (prev.has(senderId)) return prev;
        const next = new Set(prev);
        next.add(senderId);
        return next;
      });

      // Скидаємо/створюємо страхувальний таймер.
      const existing = timeouts.get(senderId);
      if (existing) {
        clearTimeout(existing);
      }
      timeouts.set(
        senderId,
        setTimeout(() => {
          timeouts.delete(senderId);
          setTypingUsers((prev) => {
            if (!prev.has(senderId)) return prev;
            const next = new Set(prev);
            next.delete(senderId);
            return next;
          });
        }, TYPING_STALE_MS),
      );
    } else {
      // Користувач зупинився — прибираємо одразу та скасовуємо таймер.
      setTypingUsers((prev) => {
        if (!prev.has(senderId)) return prev;
        const next = new Set(prev);
        next.delete(senderId);
        return next;
      });
      const timer = timeouts.get(senderId);
      if (timer) {
        clearTimeout(timer);
        timeouts.delete(senderId);
      }
    }
  }, []);

  useEffect(() => {
    if (!(chatId && user?.id)) return;

    // Копіюємо поточний Map у локальну змінну, щоб cleanup використовував
    // стабільне посилання (рекомендація react-hooks/exhaustive-deps).
    const typingTimeouts = typingTimeoutsRef.current;

    // Створюємо канал для конкретного чату.
    const channel = realtimeApi.createChatChannel(chatId);
    channelRef.current = channel;

    // Слухаємо broadcast-"typing" події.
    realtimeApi.subscribeToTyping(channel, handleTypingBroadcast);

    channel.subscribe((status: string) => {
      // Для broadcast не потрібен початковий стан (на відміну від presence),
      // тому окремих дій при SUBSCRIBED не виконуємо.
      if (process.env.NODE_ENV === 'development' && status === 'CHANNEL_ERROR') {
        console.warn('Chat events channel error for chat:', chatId);
      }
    });

    return () => {
      if (channel) {
        try {
          realtimeApi.unsubscribe(channel);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Error during chat events cleanup:', error);
          }
        }
      }
      channelRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Clear all receiver-side typing safety timers
      typingTimeouts.forEach((timer) => clearTimeout(timer));
      typingTimeouts.clear();
    };
  }, [chatId, handleTypingBroadcast, user?.id]);

  const setTyping = useCallback((typing: boolean) => {
    const channel = channelRef.current;
    const currentUserId = userIdRef.current;
    if (!channel || !currentUserId) return;

    const send = (value: boolean) => {
      void realtimeApi.broadcast(channel, 'typing', {
        user_id: currentUserId,
        isTyping: value,
      });
    };

    // Зупинка друку — надсилаємо миттєво, без тротлінгу.
    if (!typing) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      send(false);
      return;
    }

    // Тротлінг: "друкую..." надсилаємо не частіше ніж раз на TYPING_THROTTLE_MS.
    const now = Date.now();
    const shouldSend = now - lastSentRef.current >= TYPING_THROTTLE_MS;
    if (shouldSend) {
      send(true);
      lastSentRef.current = now;
    }

    // Страхувальний таймер на стороні відправника: якщо користувач перестав
    // друкувати і компонент не викликав setTyping(false), отримувач все одно
    // отримає "не друкує" через TYPING_AUTO_CLEAR_MS.
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      if (channelRef.current && userIdRef.current) {
        void realtimeApi.broadcast(channelRef.current, 'typing', {
          user_id: userIdRef.current,
          isTyping: false,
        });
      }
      timeoutRef.current = null;
    }, TYPING_AUTO_CLEAR_MS);
  }, []);

  return { typingUsers, setTyping };
}