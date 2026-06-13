'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { memo, useEffect, useState } from 'react';

function SearchInputBase() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const currentQuery = params.get('q') || '';

      if (query === currentQuery) return;

      if (query) {
        params.set('q', query);
      } else {
        params.delete('q');
      }
      router.push(`?${params.toString()}`, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, router, searchParams]);

  return (
    <div className="relative group px-4.5 mb-2">
      <div className="absolute left-7.5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#8d96e9] transition-colors duration-200">
        <Search className="w-3.5 h-3.5" />
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Пошук за email..."
        className="w-full bg-white/[0.02] border border-white/[0.06] rounded-md py-1.5 pl-8.5 pr-8 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#5e6ad2]/50 focus:border-[#5e6ad2]/30 transition-all duration-200 placeholder:text-gray-500"
      />
      <div className="absolute right-7.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
        <span className="text-[9px] text-gray-500 bg-white/5 border border-white/5 px-1 py-0.5 rounded">
          ⌘K
        </span>
      </div>
    </div>
  );
}

export const SearchInput = memo(SearchInputBase);
