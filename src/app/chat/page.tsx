'use client';

import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useChats } from '@/hooks/chat';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';

export default function ChatEmptyPage() {
  const router = useRouter();
  const { user } = useSupabaseAuth();
  const { data: chatsData } = useChats();

  const hasUnreadMessages = useMemo(() => {
    if (!chatsData?.pages || !user) return false;

    for (const page of chatsData.pages) {
      for (const chat of page) {
        const lastMessage = chat.messages?.[0];
        if (!lastMessage) continue;
        
        // Skip if last message is from current user
        if (lastMessage.sender_id === user.id) continue;

        // Check if message is unread
        const readMessageId = chat.user_id === user.id ? chat.user_last_read_id : chat.recipient_last_read_id;
        const readMessage = chat.messages?.find((m: any) => m.id === readMessageId);
        const readAt = readMessage?.created_at;

        if (!readAt || new Date(lastMessage.created_at) > new Date(readAt)) {
          return true;
        }
      }
    }
    return false;
  }, [chatsData, user?.id]);

  const handleClick = () => {
    router.push('/chat');
    window.dispatchEvent(new Event('open-mobile-sidebar'));
  };

  return (
    <div className="flex items-center justify-center h-[calc(100dvh-56px)] px-4 overflow-hidden bg-[#0e1621]">
      <style>{`
        /* Card smoothly appears from below with soft fade */
        @keyframes smooth-pro-entrance {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Icon cascades up slightly later (parallax effect) */
        @keyframes icon-cascade {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-pro-appear {
          animation: smooth-pro-entrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .animate-icon-cascade {
          opacity: 0;
          animation: icon-cascade 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
        }

        /* Notification badge pulse animation */
        @keyframes badge-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(51, 144, 236, 0.4);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(51, 144, 236, 0);
          }
        }

        .notification-badge {
          animation: badge-pulse 2s ease-in-out infinite;
        }
      `}</style>
      <button
        type="button"
        onClick={handleClick}
        className="animate-pro-appear w-24 h-24 bg-white/[0.03] rounded-2xl flex items-center justify-center border border-white/[0.08] shadow-xl cursor-pointer transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] hover:scale-105 active:scale-95 relative"
        aria-label="Go to chat list"
      >
        <MessageSquare className="animate-icon-cascade w-12 h-12 text-gray-400/70" />
        {hasUnreadMessages && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#3390ec] rounded-full notification-badge shadow-[0_0_8px_rgba(51,144,236,0.6)]" />
        )}
      </button>
    </div>
  );
}
