'use client';

import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { realtimeApi } from '@/services/realtime/realtime.service';

interface PresenceState {
  [key: string]: {
    user_id: string;
    isTyping: boolean;
    online_at: string;
  }[];
}

/**
 * Хук для подій чату (typing indicator) через Presence.
 * Підписка на повідомлення тепер відбувається глобально в useChatsRealtime.
 */
export function useChatEvents(chatId: string, user: User | null) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentRef = useRef<number>(0);
  const userIdRef = useRef<string | null>(null);

  // Update userId ref when user changes
  useEffect(() => {
    userIdRef.current = user?.id || null;
  }, [user?.id]);

  const handlePresenceSync = useCallback(() => {
    if (!channelRef.current) return;
    const state = channelRef.current.presenceState();
    const typing = new Set<string>();

    Object.values(state as unknown as PresenceState).forEach((presences) => {
      presences.forEach((p) => {
        if (p.isTyping && p.user_id !== userIdRef.current) {
          typing.add(p.user_id);
        }
      });
    });

    setTypingUsers((prev) => {
      if (prev.size !== typing.size) return typing;
      for (const id of typing) {
        if (!prev.has(id)) return typing;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!(chatId && user?.id)) return;

    // РЎС‚РІРѕСЂСЋС”РјРѕ РєР°РЅР°Р» РґР»СЏ РїСЂРёСЃСѓС‚РЅРѕСЃС‚С– РІ РєРѕРЅРєСЂРµС‚РЅРѕРјСѓ С‡Р°С‚С–
    const channel = realtimeApi.createChatChannel(chatId);
    channelRef.current = channel;

    // Listen for typing (presence)
    channel.on('presence', { event: 'sync' }, handlePresenceSync);

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ user_id: userIdRef.current, isTyping: false });
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
    };
  }, [chatId, handlePresenceSync, user?.id]);

  const setTyping = useCallback((typing: boolean) => {
    if (!channelRef.current) return;

    const now = Date.now();
    // Throttle: РІС–РґРїСЂР°РІР»СЏС”РјРѕ СЃС‚Р°С‚СѓСЃ РєРѕР¶РЅС– 2.5 СЃРµРєСѓРЅРґРё
    if (typing && now - lastSentRef.current < 2500) return;

    channelRef.current.track({ user_id: userIdRef.current, isTyping: typing });
    if (typing) lastSentRef.current = now;

    // РђРІС‚РѕРјР°С‚РёС‡РЅРµ РІРёРјРєРЅРµРЅРЅСЏ СЃС‚Р°С‚СѓСЃСѓ С‡РµСЂРµР· 3 СЃРµРєСѓРЅРґРё Р±РµР·РґС–СЏР»СЊРЅРѕСЃС‚С–
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (typing) {
      timeoutRef.current = setTimeout(() => {
        channelRef.current?.track({ user_id: userIdRef.current, isTyping: false });
      }, 3000);
    }
  }, []);

  return { typingUsers, setTyping };
}
