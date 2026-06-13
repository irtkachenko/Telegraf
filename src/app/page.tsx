'use client';

import { ArrowRight, LogIn, MessageSquare, Shield, Sparkles, Zap } from 'lucide-react';
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
          <span className="hidden sm:inline-block text-[10px] text-gray-500 bg-white/5 px-1 py-0.5 rounded border border-white/5 ml-1">
            ⌘L
          </span>
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
          Кращий спосіб спілкуватися <br />
          <span className="bg-gradient-to-r from-gray-200 via-white to-gray-500 bg-clip-text text-transparent">
            з командою в реальному часі.
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
          <button
            type="button"
            onClick={() => handleSignIn()}
            className="flex items-center justify-center gap-1.5 px-6 py-3 rounded-lg border border-white/5 bg-white/[0.02] text-gray-300 font-medium text-sm hover:bg-white/[0.06] hover:text-white transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>Переглянути чати</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Interactive App Mockup Preview */}
        <div className="relative mt-16 sm:mt-24 w-full max-w-5xl rounded-xl border border-white/[0.08] bg-[#0c0d0f]/90 shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden animate-border-glow select-none">
          {/* Mock Window Header */}
          <div className="h-11 border-b border-white/[0.05] bg-[#111214] flex items-center justify-between px-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 group hover:bg-red-500 transition-colors" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 group hover:bg-yellow-500 transition-colors" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 group hover:bg-green-500 transition-colors" />
              <span className="text-xs text-gray-500 font-mono ml-4 tracking-wider">Telegraf Workspace</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 bg-white/5 border border-white/5 px-2 py-0.5 rounded-md">
                ⌘K для швидкого пошуку
              </span>
            </div>
          </div>

          {/* Mock App Body */}
          <div className="h-[450px] flex">
            {/* Mock Sidebar */}
            <div className="w-60 border-r border-white/[0.05] bg-[#0c0d0f] p-3 flex flex-col gap-4">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-bold text-gray-200">Робочий простір</span>
                <span className="text-[10px] text-[#5e6ad2] font-semibold bg-[#5e6ad2]/10 px-1.5 py-0.5 rounded">
                  PRO
                </span>
              </div>

              {/* View Toggle */}
              <div className="grid grid-cols-2 p-0.5 bg-white/5 rounded-lg border border-white/[0.05]">
                <div className="text-[10px] font-semibold text-center py-1 bg-[#1a1b1f] text-white rounded shadow-sm">
                  Діалоги
                </div>
                <div className="text-[10px] font-semibold text-center py-1 text-gray-400">
                  Контакти
                </div>
              </div>

              {/* Chat list */}
              <div className="flex flex-col gap-1.5">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  Нещодавні чати
                </div>

                {/* Mock Active Chat */}
                <div className="flex items-center gap-2.5 p-2 bg-white/[0.04] border border-white/5 rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white shadow-inner">
                    ОП
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white truncate">Олександр Петренко</span>
                      <span className="text-[9px] text-gray-500">12:34</span>
                    </div>
                    <span className="text-[10px] text-gray-400 block truncate">Ми завершили новий дизайн...</span>
                  </div>
                </div>

                {/* Mock Other Chats */}
                <div className="flex items-center gap-2.5 p-2 hover:bg-white/[0.02] rounded-lg transition-colors cursor-pointer">
                  <div className="w-7 h-7 rounded-full bg-[#1b1c20] border border-white/5 flex items-center justify-center text-[10px] font-bold text-gray-400">
                    МШ
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-300">Марія Шевченко</span>
                      <span className="text-[9px] text-gray-500">Вчора</span>
                    </div>
                    <span className="text-[10px] text-gray-500 block truncate">Дякую за фідбек!</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 p-2 hover:bg-white/[0.02] rounded-lg transition-colors cursor-pointer">
                  <div className="w-7 h-7 rounded-full bg-[#1b1c20] border border-white/5 flex items-center justify-center text-[10px] font-bold text-gray-400">
                    ДБ
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-300">Дмитро Бойко</span>
                      <span className="text-[9px] text-gray-500">3 дні тому</span>
                    </div>
                    <span className="text-[10px] text-gray-500 block truncate">Надіслав файли проекту</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mock Chat Window */}
            <div className="flex-1 bg-[#08080a] flex flex-col justify-between">
              {/* Mock Chat Header */}
              <div className="h-12 border-b border-white/[0.05] bg-[#0c0d0f]/50 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-[9px] font-bold text-white">
                    ОП
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Олександр Петренко</div>
                    <div className="text-[9px] text-green-400">в мережі</div>
                  </div>
                </div>
              </div>

              {/* Mock Chat Message List (Comment Stream Style!) */}
              <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">
                {/* Message 1 */}
                <div className="flex gap-3 items-start max-w-2xl">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow">
                    ОП
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-white">Олександр Петренко</span>
                      <span className="text-[9px] text-gray-500">12:30</span>
                    </div>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                      Привіт! Я оновив стилі для нашого месенджера. Тепер він виглядає суперчисто, як Linear. Що думаєш?
                    </p>
                  </div>
                </div>

                {/* Message 2 (Me) */}
                <div className="flex gap-3 items-start max-w-2xl">
                  <div className="w-8 h-8 rounded-full bg-[#1b1c20] border border-white/5 flex items-center justify-center text-xs font-bold text-[#8d96e9] shrink-0">
                    ТИ
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-white">Ви</span>
                      <span className="text-[9px] text-gray-500">12:32</span>
                    </div>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                      Виглядає неймовірно! Темний фон `#08080a`, тонкі рамки та чисті шрифти створюють преміальне враження. Кольори та градієнти просто вогонь. 🔥
                    </p>
                  </div>
                </div>

                {/* Message 3 */}
                <div className="flex gap-3 items-start max-w-2xl animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow">
                    ОП
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-white">Олександр Петренко</span>
                      <span className="text-[9px] text-[#5e6ad2]">друкує...</span>
                    </div>
                    <div className="h-4 bg-white/5 rounded w-1/2 mt-2" />
                  </div>
                </div>
              </div>

              {/* Mock Chat Input */}
              <div className="p-4 border-t border-white/[0.05] bg-[#0c0d0f]/50">
                <div className="border border-white/10 rounded-xl bg-white/[0.02] p-2 flex flex-col gap-2 focus-within:border-[#5e6ad2]/50 focus-within:ring-1 focus-within:ring-[#5e6ad2]/30 transition-all duration-300">
                  <div className="text-xs text-gray-500 px-2 py-1">Напишіть повідомлення...</div>
                  <div className="flex items-center justify-between border-t border-white/[0.03] pt-2 px-2">
                    <div className="flex gap-2 text-gray-500">
                      <span className="text-[10px] hover:text-white transition-colors cursor-pointer">📎 Файл</span>
                    </div>
                    <div className="px-2 py-1 bg-[#5e6ad2] text-white text-[10px] font-bold rounded-lg cursor-pointer hover:bg-[#4e5ac2] transition-colors">
                      Надіслати
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights section */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 sm:mt-32 w-full text-left">
          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#111214]/40 hover:bg-[#111214]/60 transition-all hover:border-white/10">
            <Zap className="w-5 h-5 text-[#5e6ad2] mb-3" />
            <h3 className="text-sm font-bold text-white mb-2">Миттєва швидкість</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Жодних затримок при доставці повідомлень. Надіслані файли завантажуються миттєво завдяки оптимізованій базі даних.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#111214]/40 hover:bg-[#111214]/60 transition-all hover:border-white/10">
            <Shield className="w-5 h-5 text-[#5e6ad2] mb-3" />
            <h3 className="text-sm font-bold text-white mb-2">Безпека даних</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Інтеграція з Supabase Auth гарантує, що ваші дані завжди надійно захищені від стороннього доступу.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-white/[0.05] bg-[#111214]/40 hover:bg-[#111214]/60 transition-all hover:border-white/10">
            <MessageSquare className="w-5 h-5 text-[#5e6ad2] mb-3" />
            <h3 className="text-sm font-bold text-white mb-2">Зручні коментарі</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Преміальний вигляд стрічки повідомлень у формі коментарів ідеально підходить для розробників та сучасних команд.
            </p>
          </div>
        </section>
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
