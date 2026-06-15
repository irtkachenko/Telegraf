'use client';

import { LogIn } from 'lucide-react';
import { handleSignIn } from '@/lib/auth';

export default function Home() {
  return (
    <div className="landing-page relative flex flex-col min-h-[100dvh] overflow-hidden bg-black">
      {/* Bottom horizon glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 160% 60% at 50% 100%, rgba(60, 130, 220, 0.55) 0%, rgba(40, 100, 200, 0.35) 25%, transparent 60%),
            radial-gradient(ellipse 100% 40% at 50% 100%, rgba(100, 160, 240, 0.4) 0%, transparent 45%),
            radial-gradient(ellipse 60% 25% at 50% 100%, rgba(140, 190, 255, 0.25) 0%, transparent 40%)
          `,
        }}
      />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <h1 className="text-xl font-black italic tracking-tighter text-white uppercase">
          Telegraf<span className="text-gray-400">.</span>
        </h1>
        <button
          type="button"
          onClick={() => handleSignIn()}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-100 transition-all hover:scale-105 active:scale-95"
        >
          <LogIn className="w-4 h-4" />
          Log in
        </button>
      </nav>

      {/* Hero content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 -mt-16">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-[-0.03em] max-w-4xl leading-[1.15]">
          Telegraf 
        </h2>
        <p className="text-gray-400 font-medium tracking-tight text-sm sm:text-base mb-10 opacity-80">
          Sign in to start chatting
        </p>
        <button
          type="button"
          onClick={() => handleSignIn()}
          className="flex items-center gap-2.5 px-7 py-2.5 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10"
        >
          <LogIn className="w-4 h-4" />
          Log in
        </button>
      </main>

      {/* Decorative 4-pointed star */}
      <div className="absolute bottom-8 right-8 sm:bottom-12 sm:right-12 z-10 animate-pulse">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 0C16 0 18 12 16 16C14 20 16 32 16 32C16 32 14 20 16 16C18 12 16 0 16 0Z"
            fill="rgba(255,255,255,0.5)"
          />
          <path
            d="M0 16C0 16 12 14 16 16C20 18 32 16 32 16C32 16 20 18 16 16C12 14 0 16 0 16Z"
            fill="rgba(255,255,255,0.5)"
          />
        </svg>
      </div>
    </div>
  );
}
