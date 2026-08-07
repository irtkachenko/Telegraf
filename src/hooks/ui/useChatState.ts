'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatStateResult {
  isChatOpen: boolean;
  isWindowFocused: boolean;
  isDocumentVisible: boolean;
  openChat: (chatId: string) => void;
  closeChat: (chatId: string) => void;
  getCurrentChat: () => string | null;
}

/**
 * Hook for managing chat state (open, focused, visible)
 */
export function useChatState(): ChatStateResult {
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const currentChatRef = useRef<string | null>(null);
  const [isWindowFocused, setIsWindowFocused] = useState(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true,
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  );

  // Keep the ref in sync with the state so callbacks can read the latest
  // value without depending on the state itself (stable identities).
  useEffect(() => {
    currentChatRef.current = currentChat;
  }, [currentChat]);

  // Track window focus
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

  // Track document visibility
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

  // Open chat
  const openChat = useCallback((chatId: string) => {
    setCurrentChat(chatId);
  }, []);

  // Close chat — stable identity (reads from ref, not state)
  const closeChat = useCallback((chatId: string) => {
    if (currentChatRef.current === chatId) {
      setCurrentChat(null);
    }
  }, []);

  // Get current chat — stable identity (reads from ref, not state)
  const getCurrentChat = useCallback(() => currentChatRef.current, []);

  return {
    isChatOpen: currentChat !== null,
    isWindowFocused,
    isDocumentVisible,
    openChat,
    closeChat,
    getCurrentChat,
  };
}