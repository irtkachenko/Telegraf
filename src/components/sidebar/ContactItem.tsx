'use client';

import { Loader2, MessageSquarePlus, User as UserIcon } from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import { useGetOrCreateChat } from '@/hooks/chat/useGetOrCreateChat';
import { formatRelativeTime } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import type { AppUser } from '@/types';

import { PresenceIndicator } from './PresenceIndicator';

interface ContactItemProps {
  user: AppUser;
  disabled: boolean;
  onActionStart?: (id: string) => void;
  onActionEnd?: () => void;
}

function ContactItemBase({ user, disabled, onActionStart, onActionEnd }: ContactItemProps) {
  const { user: currentUser } = useSupabaseAuth();
  const getOrCreateChat = useGetOrCreateChat();

  const handleStartChat = () => {
    if (disabled || !currentUser?.id) return;

    onActionStart?.(user.id);
    getOrCreateChat.mutate(user.id, {
      onSuccess: () => {
        onActionEnd?.();
      },
      onError: () => {
        onActionEnd?.();
      },
    });
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all border border-transparent group',
        getOrCreateChat.isPending ? 'bg-white/[0.06] border-white/[0.06]' : 'hover:bg-white/[0.02] hover:border-white/[0.02]',
      )}
    >
      <div className="relative w-8 h-8 rounded-full shrink-0">
        <div className="w-full h-full rounded-full overflow-hidden border border-white/10 bg-white/5 relative">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name || 'User'}
              fill
              sizes="32px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-gray-500" />
            </div>
          )}
        </div>
        <PresenceIndicator userId={user.id} className="absolute bottom-0 right-0 w-2 h-2 border-black" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-300 truncate group-hover:text-white transition-colors">
          {user.name || 'Anonymous'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10px] text-gray-500 truncate lowercase">{user.email}</p>
          <PresenceIndicator userId={user.id} showOffline={false} className="hidden" />
          {user.last_seen && (
            <>
              <span className="text-[9px] text-gray-600">&bull;</span>
              <p className="text-[10px] text-gray-500">{formatRelativeTime(user.last_seen)}</p>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled || getOrCreateChat.isPending}
        onClick={handleStartChat}
        className={cn(
          'p-1.5 rounded-md transition-all shrink-0 cursor-pointer border border-transparent',
          getOrCreateChat.isPending
            ? 'bg-white text-black'
            : 'bg-white/[0.03] text-gray-400 border-white/[0.05] hover:bg-[#5e6ad2] hover:text-white hover:border-transparent lg:opacity-0 lg:group-hover:opacity-100',
          disabled &&
            !getOrCreateChat.isPending &&
            'opacity-50 cursor-not-allowed pointer-events-none',
        )}
        title="Send Message"
      >
        {getOrCreateChat.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <MessageSquarePlus className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

export const ContactItem = memo(ContactItemBase);
