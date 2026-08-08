'use client';

import { usePathname } from 'next/navigation';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
import PushSubscriptionGuard from '@/components/push/PushSubscriptionGuard';
import PushSubscriptionPrompt from '@/components/push/PushSubscriptionPrompt';
import { useChatsRealtime } from '@/hooks/chat';
import Navbar from './Navbar';

interface ChatLayoutWrapperProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export default function ChatLayoutWrapper({ children, sidebar, user }: ChatLayoutWrapperProps) {
  const { supabaseUser } = useSupabaseAuth();
  useChatsRealtime(supabaseUser);
  const pathname = usePathname();

  // On the landing page (root path) when not logged in, render children directly
  // since the landing page has its own built-in navbar
  const isLandingPage = pathname === '/' && !user;

  if (isLandingPage) {
    return <>{children}</>;
  }

  // Sidebar is always visible (no drawer). On mobile it takes the full available width
  // (like a chat list screen); when viewing a chat the chat takes the full width instead.
  const isChatView = pathname !== '/chat' && pathname.startsWith('/chat/');

  return (
    <div className="flex flex-col h-[100dvh]">
      <Navbar user={user} />
      {user && <PushSubscriptionGuard />}
      {user && <PushSubscriptionPrompt />}

      <div className="flex flex-1 pt-14 relative overflow-hidden">
        {/* Sidebar — always visible as a static column */}
        <aside
          className={`
            h-full
            bg-[#0c0d0f] lg:bg-transparent
            border-r border-white/[0.05]
            ${user ? (isChatView ? 'hidden lg:flex' : 'w-full lg:w-80') : 'w-0 opacity-0 invisible overflow-hidden border-none'}
          `}
        >
          <div className="w-full h-full overflow-hidden">{sidebar}</div>
        </aside>

        <main
          className={`
            flex-1 w-full min-w-0 relative z-0
            ${isChatView ? '' : 'hidden lg:block'}
          `}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
