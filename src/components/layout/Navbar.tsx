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
    <nav className="fixed top-0 left-0 right-0 z-[800] flex items-center justify-between px-4 sm:px-6 h-14 border-b border-white/[0.05] bg-[#08080a]/70 backdrop-blur-md">
      {/* Left: Menu & Logo */}
      <div className="flex items-center gap-2">
        {user && (
          <button
            type="button"
            onClick={onMenuClick}
            className="p-1.5 -ml-1.5 hover:bg-white/5 border border-transparent hover:border-white/5 rounded-md text-gray-400 hover:text-white transition-all lg:hidden cursor-pointer"
            aria-label="Toggle Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <Logo />
      </div>

      {/* Right: Connection Status & Auth */}
      <div className="flex items-center gap-3">
        {user && <ConnectionIndicator showText />}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 hover:opacity-95 focus:outline-none group cursor-pointer"
              >
                <span className="hidden sm:block text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">
                  {user.name}
                </span>
                <div className="relative w-7 h-7 rounded-full overflow-hidden border border-white/10 group-hover:border-white/20 transition-all">
                  <Image
                    src={user.image || '/default-avatar.png'}
                    alt="avatar"
                    fill
                    sizes="28px"
                    className="object-cover"
                  />
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 bg-[#121216] border border-white/[0.08] text-white rounded-lg p-1">
              <div className="px-2.5 py-2">
                <p className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                  Активний акаунт
                </p>
                <p className="text-xs font-medium text-gray-200 truncate mt-0.5">{user.email}</p>
              </div>

              <DropdownMenuSeparator className="bg-white/[0.05]" />

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
