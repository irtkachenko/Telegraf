'use client';

import { LogIn, LogOut } from 'lucide-react';
import { handleSignIn, handleSignOut } from '@/lib/auth';

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => handleSignIn()}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-semibold text-gray-200 hover:text-white transition-all hover:bg-white/[0.08] hover:border-white/20 active:scale-95 cursor-pointer shadow-sm"
    >
      <LogIn className="w-3.5 h-3.5 text-[#8d96e9]" />
      <span>Увійти</span>
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => handleSignOut()}
      className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-md flex items-center gap-2 transition-colors cursor-pointer"
    >
      <LogOut className="w-3.5 h-3.5" />
      <span>Вийти з акаунту</span>
    </button>
  );
}
