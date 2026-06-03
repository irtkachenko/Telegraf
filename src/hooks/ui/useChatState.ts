'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ChatStateResult {
  isChatOpen: boolean;
  isWindowFocused: boolean;
  isDocumentVisible: boolean;
  openChat: (chatId: string) => void;
  closeChat: (chatId: string) => void;
  getCurrentChat: () => string | null;
}

/**
 * Hook РґР»СЏ СѓРїСЂР°РІР»С–РЅРЅСЏ СЃС‚Р°РЅРѕРј С‡Р°С‚С–РІ (РІС–РґРєСЂРёС‚С–, СЃС„РѕРєСѓСЃРѕРІР°РЅС–)
 */
export function useChatState(): ChatStateResult {
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [isWindowFocused, setIsWindowFocused] = useState(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true,
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  // Р’С–РґСЃС‚РµР¶СѓС”РјРѕ С„РѕРєСѓСЃ РІС–РєРЅР°
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => {
      setIsWindowFocused(false);
      setCurrentChat(null);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Р’С–РґСЃС‚РµР¶СѓС”РјРѕ РІРёРґРёРјС–СЃС‚СЊ РґРѕРєСѓРјРµРЅС‚Р°
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setIsDocumentVisible(isVisible);
      if (!isVisible) {
        setCurrentChat(null);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Р’С–РґРєСЂРёРІР°С”РјРѕ С‡Р°С‚
  const openChat = useCallback((chatId: string) => {
    setCurrentChat(chatId);
  }, []);

  // Р—Р°РєСЂРёРІР°С”РјРѕ С‡Р°С‚
  const closeChat = useCallback(
    (chatId: string) => {
      if (currentChat === chatId) {
        setCurrentChat(null);
      }
    },
    [currentChat],
  );

  // РћС‚СЂРёРјСѓС”РјРѕ РїРѕС‚РѕС‡РЅРёР№ С‡Р°С‚
  const getCurrentChat = useCallback(() => currentChat, [currentChat]);

  return {
    isChatOpen: currentChat !== null,
    isWindowFocused,
    isDocumentVisible,
    openChat,
    closeChat,
    getCurrentChat,
  };
}
