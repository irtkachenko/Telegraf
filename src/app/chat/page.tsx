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
    <div className="flex items-center justify-center h-[calc(100dvh-56px)] px-4 overflow-hidden">
      <button
        type="button"
        onClick={handleClick}
        className="w-24 h-24 bg-white/[0.03] rounded-3xl flex items-center justify-center border border-white/10 shadow-2xl cursor-pointer transition-all duration-200 hover:bg-white/[0.06] hover:border-white/20 hover:scale-105 active:scale-95"
        aria-label="Go to chat list"
      >
        <MessageSquare className="w-12 h-12 text-gray-500/50" />
      </button>
    </div>
  );
}
