import { Menu } from 'lucide-react';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SignInButton, SignOutButton } from '../auth/auth-buttons';
import Logo from '../ui/Logo';
import { ConnectionIndicator } from './ConnectionIndicator';

interface NavbarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  onMenuClick?: () => void;
}

export default function Navbar({ user, onMenuClick }: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-[800] flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/10 bg-black/50 backdrop-blur-lg">
      {/* Left: Menu & Logo */}
      <div className="flex items-center gap-2 sm:gap-4">
        {user && (
          <button
            type="button"
            onClick={onMenuClick}
            className="p-2 -ml-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors lg:hidden"
            aria-label="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <Logo />
      </div>

      {/* Right: Connection Status & Auth */}
      <div className="flex items-center gap-4">
        {user && <ConnectionIndicator showText />}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none group"
              >
                <span className="hidden sm:block text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                  {user.name}
                </span>
                <div className="relative w-9 h-9 rounded-full overflow-hidden border border-white/20 group-hover:border-white/40 transition-all">
                  <Image
                    src={user.image || '/default-avatar.png'}
                    alt="avatar"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                  Активний аккаунт
                </p>
                <p className="text-sm font-medium text-white truncate mt-0.5">{user.email}</p>
              </div>

              <DropdownMenuSeparator />

              {/* Тут ми використовуємо твій SignOutButton, але стилізуємо його під пункт меню */}
              <div className="p-0">
                <SignOutButton />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SignInButton />
        )}
      </div>
    </nav>
  );
}
