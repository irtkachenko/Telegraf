'use client';

import { useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { PwaInstallButton } from '@/components/pwa/PwaInstallButton';
import { handleSignIn } from '@/lib/auth';

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  const targetPos = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const initialX = window.innerWidth / 2;
      const initialY = window.innerHeight / 2;
      targetPos.current = { x: initialX, y: initialY };
      currentPos.current = { x: initialX, y: initialY };
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      targetPos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const animateGlow = () => {
      // Smooth linear interpolation (lerp)
      const ease = 0.07;
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * ease;
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * ease;

      if (glowRef.current) {
        const x = currentPos.current.x.toFixed(1);
        const y = currentPos.current.y.toFixed(1);
        glowRef.current.style.background = `radial-gradient(720px circle at ${x}px ${y}px, rgba(99, 102, 241, 0.26), rgba(139, 92, 246, 0.14) 40%, rgba(59, 130, 246, 0.05) 65%, transparent 80%)`;
      }

      animationFrameId.current = requestAnimationFrame(animateGlow);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animationFrameId.current = requestAnimationFrame(animateGlow);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[100dvh] w-full bg-[#050508] text-[#f7f8f8] overflow-hidden flex flex-col justify-between select-none bg-grid-pattern"
    >
      {/* Dynamic Interactive Mouse Glow (Lerp Smooth & Ultra Bright) */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
        style={{
          background: `radial-gradient(720px circle at 50% 50%, rgba(99, 102, 241, 0.26), rgba(139, 92, 246, 0.14) 40%, rgba(59, 130, 246, 0.05) 65%, transparent 80%)`,
        }}
      />

      {/* Top spacing (No header logo/text as requested) */}
      <div className="h-12 w-full" />

      {/* Hero Content - Perfectly Centered */}
      <main className="relative z-40 max-w-4xl mx-auto w-full px-6 flex flex-col items-center justify-center my-auto text-center">
        {/* Main Title matching latest screenshot */}
        <h1 className="font-tech text-4xl sm:text-6xl md:text-7xl font-normal tracking-tight leading-none">
          <span className="text-[#3b82f6] drop-shadow-[0_0_25px_rgba(59,130,246,0.6)] font-medium">Telegraf</span>
          <span className="text-gray-300 mx-2.5 sm:mx-3.5">—</span>
          <span className="text-white">просто месенджер</span>
          <span className="text-[#3b82f6]">.</span>
        </h1>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => handleSignIn()}
            className="font-tech group relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#4f46e5]/25 hover:bg-[#4f46e5]/40 text-white font-medium text-sm sm:text-base border border-[#6366f1]/50 hover:border-[#6366f1]/80 shadow-[0_0_35px_rgba(99,102,241,0.38)] hover:shadow-[0_0_55px_rgba(99,102,241,0.65)] transition-all duration-300 active:scale-[0.98] cursor-pointer"
          >
            {/* Google Multi-Color SVG Icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>

            <span>Увійти з Google</span>

            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <PwaInstallButton variant="landing" />
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="relative z-40 max-w-5xl mx-auto w-full px-8 py-6 flex items-center justify-center text-xs text-gray-600 tracking-wide">
        <span>&copy; {new Date().getFullYear()} Telegraf</span>
      </footer>
    </div>
  );
}



