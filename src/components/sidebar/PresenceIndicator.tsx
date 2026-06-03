'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useIsUserOnline } from '@/store/usePresenceStore';

interface PresenceIndicatorProps {
  userId: string;
  className?: string;
  showOffline?: boolean;
}

function PresenceIndicatorBase({ userId, className, showOffline = false }: PresenceIndicatorProps) {
  // Use optimized selector to prevent re-renders when other users change status
  const isOnline = useIsUserOnline(userId);

  return (
    <div
      className={cn(
        'rounded-full border-2 border-black',
        isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-500',
        !(isOnline || showOffline) && 'hidden',
        className,
      )}
    />
  );
}

export const PresenceIndicator = memo(PresenceIndicatorBase);
