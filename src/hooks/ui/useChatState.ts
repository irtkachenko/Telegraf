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

  // Track window focus.
  // NOTE: we intentionally do NOT reset `currentChat` on blur/hide — the
  // `isWindowFocused` / `isDocumentVisible` flags already gate auto-read while
  // the window is away. Resetting `currentChat` here made the chat permanently
  // "closed", so returning to the window at the bottom of the chat never
  // re-marked the newly arrived messages as read.
  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => {
      setIsWindowFocused(false);
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
