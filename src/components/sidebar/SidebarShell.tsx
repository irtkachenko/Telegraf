'use client';

import { MessageSquare, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { memo, Suspense, useEffect } from 'react';
import { ChatList } from './ChatList';
import { ContactsList } from './ContactsList';
import { SearchInput } from './SearchInput';

function SidebarShellBase() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = searchParams.get('tab') || 'chats';
  const query = searchParams.get('q') || '';

  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'chats');
      router.replace(`?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, router]);

  const setTab = (newTab: 'chats' | 'contacts') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    if (newTab === 'chats') {
      params.delete('q');
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <aside
      className="h-screen lg:h-[calc(100vh-56px)] w-80 bg-[#0c0d0f] border-r border-white/[0.05] flex flex-col z-40 shrink-0 overflow-hidden"
      style={{ willChange: 'transform' }}
    >
      {/* Header section with cleaner spacing */}
      <div className="pt-4 pb-2">
        {/* Sleek Segmented Switcher */}
        <div className="px-4.5 mb-4">
          <div className="flex p-0.5 bg-white/[0.02] rounded-lg border border-white/[0.05]">
            <button
              type="button"
              onClick={() => setTab('chats')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
                tab === 'chats'
                  ? 'bg-white/[0.06] text-white shadow-sm border border-white/[0.05]'
                  : 'text-gray-400 hover:text-gray-200 border border-transparent'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#8d96e9]" />
              <span>Діалоги</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('contacts')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 cursor-pointer ${
                tab === 'contacts'
                  ? 'bg-white/[0.06] text-white shadow-sm border border-white/[0.05]'
                  : 'text-gray-400 hover:text-gray-200 border border-transparent'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#8d96e9]" />
              <span>Контакти</span>
            </button>
          </div>
        </div>

        {/* Contacts Specific UI */}
        {tab === 'contacts' && <SearchInput />}

        {/* Chats Specific UI */}
        {tab === 'chats' && <div className="h-0" />}
      </div>

      {/* Lists */}
      <div className="flex-1 flex flex-col min-h-0 py-1 overflow-hidden">
        {tab === 'chats' ? (
          <>
            <div className="mb-2.5 px-4.5">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Ваші діалоги
              </h2>
            </div>
            <ChatList />
          </>
        ) : (
          <ContactsList query={query} />
        )}
      </div>
    </aside>
  );
}

export const SidebarShell = memo(function SidebarShellWrapper() {
  return (
    <Suspense
      fallback={
        <div className="w-80 h-screen bg-[#0c0d0f] border-r border-white/[0.05] animate-pulse" />
      }
    >
      <SidebarShellBase />
    </Suspense>
  );
});
