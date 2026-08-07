'use client';

import { MessageSquare } from 'lucide-react';

export default function ChatEmptyPage() {
  return (
    <div className="flex items-center justify-center h-[calc(100dvh-56px)] px-4 overflow-hidden">
      <div className="w-24 h-24 bg-white/[0.03] rounded-3xl flex items-center justify-center border border-white/10 shadow-2xl">
        <MessageSquare className="w-12 h-12 text-gray-500/50" />
      </div>
    </div>
  );
}
