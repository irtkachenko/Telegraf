'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    ('standalone' in window.navigator && window.navigator.standalone === true)
  );
}

function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function getManualInstallMessage(): string {
  if (typeof window === 'undefined') {
    return 'Відкрийте меню браузера і виберіть встановлення додатка.';
  }

  const userAgent = window.navigator.userAgent.toLowerCase();

  if (isIosDevice()) {
    return 'На iPhone або iPad натисніть Поділитися і виберіть На екран Домівки.';
  }

  if (userAgent.includes('firefox')) {
    return 'Відкрийте меню браузера і виберіть Встановити або Додати на головний екран.';
  }

  if (userAgent.includes('edg/')) {
    return 'Відкрийте меню Edge і виберіть Apps, а потім Install this site as an app.';
  }

  return 'Відкрийте меню браузера і виберіть Встановити додаток або Додати на головний екран.';
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneMode());
  const [isIos] = useState(() => isIosDevice());
  const [isPrompting, setIsPrompting] = useState(false);
  const [installUnavailableReason, setInstallUnavailableReason] = useState<string | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallUnavailableReason(null);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
      setInstallUnavailableReason(null);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      setIsInstalled(isStandaloneMode());
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (isInstalled) return true;

    if (!installPrompt) {
      setInstallUnavailableReason(getManualInstallMessage());
      return false;
    }

    setIsPrompting(true);
    setInstallUnavailableReason(null);

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);

      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        return true;
      }

      setInstallUnavailableReason('Встановлення скасовано.');
      return false;
    } finally {
      setIsPrompting(false);
    }
  }, [installPrompt, isInstalled]);

  return {
    canInstall: !!installPrompt && !isInstalled,
    install,
    installUnavailableReason,
    isInstalled,
    isIos,
    isPrompting,
  };
}

export { isStandaloneMode };
