'use client';

import { useEffect, useState } from 'react';

export default function UpdateChecker({ children }: { children: React.ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version');
        const data = await res.json();
        
        if (currentVersion && data.version !== currentVersion) {
          setIsUpdating(true);
          setTimeout(() => {
            window.location.reload();
          }, 300 + Math.random() * 200);
        }
        
        setCurrentVersion(data.version);
      } catch (error) {
        console.error('Failed to check version:', error);
      }
    };

    checkVersion();
    
    window.addEventListener('focus', checkVersion);
    window.addEventListener('online', checkVersion);
    
    return () => {
      window.removeEventListener('focus', checkVersion);
      window.removeEventListener('online', checkVersion);
    };
  }, [currentVersion]);

  if (isUpdating) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-lg font-medium text-white">Встановлення оновлення...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}