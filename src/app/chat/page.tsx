'use client';

import { MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ChatEmptyPage() {
  const router = useRouter();

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
      `}</style>
      <button
        type="button"
        onClick={handleClick}
        className="animate-pro-appear w-24 h-24 bg-white/[0.03] rounded-2xl flex items-center justify-center border border-white/[0.08] shadow-xl cursor-pointer transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] hover:scale-105 active:scale-95"
        aria-label="Go to chat list"
      >
        <MessageSquare className="animate-icon-cascade w-12 h-12 text-gray-400/70" />
      </button>
    </div>
  );
}
