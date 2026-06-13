'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);

  // Закриваємо сайдбар при зміні шляху
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsSidebarOpen(false);
    }
  }, [pathname]);

  const handleClose = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener('close-mobile-sidebar', handleClose);
    return () => window.removeEventListener('close-mobile-sidebar', handleClose);
  }, [handleClose]);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  // On the landing page (root path) when not logged in, render children directly
  // since the landing page has its own built-in navbar
  const isLandingPage = pathname === '/' && !user;

  if (isLandingPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <Navbar user={user} onMenuClick={toggleSidebar} />

      <div className="flex flex-1 pt-14 relative overflow-hidden">
        {/* Overlay for mobile */}
        <button
          type="button"
          id="sidebar-overlay"
          className={`
            fixed inset-0 bg-black/60 backdrop-blur-sm lg:hidden
            transition-opacity duration-300
            z-[80] 
            ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
          onClick={() => setIsSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsSidebarOpen(false);
          }}
          aria-label="Close Sidebar"
        />

        {/* Sidebar Container with smooth transition */}
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 
            z-[90] 
            transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            transition-all duration-300 ease-in-out
            h-[calc(100dvh-56px)] mt-14 lg:mt-0
            bg-[#0c0d0f] lg:bg-transparent
            border-r border-white/[0.05]
            ${user ? 'w-80 opacity-100 visible' : 'w-0 opacity-0 invisible overflow-hidden border-none'}
          `}
        >
          <div className="w-80 h-full overflow-hidden">{sidebar}</div>
        </aside>

        <main className="flex-1 w-full min-w-0 relative z-0 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}
