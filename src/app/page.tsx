'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSupabaseAuth } from '@/components/auth/AuthProvider';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/chat');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="relative min-h-[100dvh] w-full bg-black text-[#f7f8f8] overflow-hidden flex flex-col items-center justify-center select-none">
        {/* Logo Only */}
        <div className="flex flex-col items-center gap-6">
          <Image
            src="/logo.png"
            alt="Telegraf"
            width={120}
            height={120}
            priority
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] w-full bg-black text-[#f7f8f8] overflow-hidden flex flex-col items-center justify-center select-none">
      {/* Logo Only */}
      <div className="flex flex-col items-center gap-6">
        <Image
          src="/logo.png"
          alt="Telegraf"
          width={120}
          height={120}
          priority
        />
      </div>
    </div>
  );
}



