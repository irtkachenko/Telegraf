'use client';

import Image from 'next/image';

export default function Home() {
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



