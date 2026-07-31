'use client';

import { ArrowRight, LogIn, Sparkles } from 'lucide-react';
import { handleSignIn } from '@/lib/auth';

export default function Home() {
  return (
    <div className="relative min-h-[100dvh] bg-[#08080a] text-[#f7f8f8] overflow-x-hidden bg-grid-pattern selection:bg-[#5e6ad2]/30 selection:text-white">
      {/* Brand Glow (Top Purple Eclipse) */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] pointer-events-none opacity-40 blur-[130px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(94, 106, 210, 0.45) 0%, rgba(94, 106, 210, 0.1) 60%, transparent 100%)',
        }}
      />

      {/* Brand Glow (Bottom Center Glow) */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1200px] h-[500px] pointer-events-none opacity-30 blur-[150px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(94, 106, 210, 0.35) 0%, rgba(60, 130, 220, 0.08) 50%, transparent 100%)',
        }}
      />

      {/* Header / Navbar */}
      <header className="relative z-50 max-w-7xl mx-auto px-6 h-16 flex items-center justify-between border-b border-white/[0.05] bg-[#08080a]/65 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#5e6ad2] to-[#4e5ac2] flex items-center justify-center shadow-lg shadow-[#5e6ad2]/20">
            <span className="text-white text-xs font-black">T</span>
          </div>
          <span className="text-md font-bold tracking-tight text-white flex items-center">
            Telegraf<span className="text-[#5e6ad2] font-black">.</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleSignIn()}
          className="relative group overflow-hidden flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-sm font-medium text-gray-200 hover:text-white transition-all hover:border-white/20 active:scale-95 cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Увійти</span>
        </button>
      </header>

      {/* Main Hero & Content */}
      <main className="relative z-40 max-w-6xl mx-auto px-6 pt-16 sm:pt-24 pb-24 flex flex-col items-center">
        {/* Release Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#5e6ad2]/20 bg-[#5e6ad2]/5 text-xs text-[#8d96e9] font-medium tracking-tight mb-8 animate-fade-in hover:border-[#5e6ad2]/40 transition-colors duration-300">
          <Sparkles className="w-3 h-3 text-[#8d96e9]" />
          <span>Представляємо Telegraf v1.0</span>
          <div className="w-1 h-1 rounded-full bg-[#5e6ad2]/40 mx-1" />
          <span className="text-gray-400 group hover:text-white flex items-center gap-0.5 cursor-pointer" onClick={() => handleSignIn()}>
            Спробувати <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>

        {/* Hero Heading */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-center tracking-[-0.03em] max-w-4xl leading-[1.08] text-white">
          Зручний та мінімалістичний <br />
          <span className="bg-gradient-to-r from-gray-200 via-white to-gray-500 bg-clip-text text-transparent">
          </span>
        </h1>

        {/* Hero Description */}
        <p className="text-gray-400 font-normal tracking-tight text-center text-base sm:text-lg md:text-xl max-w-2xl mt-6 leading-relaxed opacity-85">
          Сучасний мінімалістичний месенджер. Безпечний, швидкий та естетичний. Створений для продуктивних розмов без зайвого шуму.
        </p>

        {/* CTA Button Group */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mt-10">
          <button
            type="button"
            onClick={() => handleSignIn()}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#5e6ad2] text-white font-semibold text-sm hover:bg-[#4e5ac2] transition-all duration-300 hover:shadow-[0_0_24px_rgba(94,106,210,0.4)] active:scale-[0.98] border border-white/10 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Увійти з Google
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-40 max-w-7xl mx-auto px-6 py-8 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-4 mt-20">
        <div>&copy; {new Date().getFullYear()} Telegraf. Усі права захищено.</div>
        <div className="flex gap-4">
          <span className="hover:text-white transition-colors cursor-pointer" onClick={() => handleSignIn()}>Увійти</span>
          <span className="hover:text-white transition-colors cursor-pointer">Конфіденційність</span>
          <span className="hover:text-white transition-colors cursor-pointer">Правила</span>
        </div>
      </footer>
    </div>
  );
}