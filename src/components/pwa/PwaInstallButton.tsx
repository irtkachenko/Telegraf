'use client';

import { Check, Download, LoaderCircle } from 'lucide-react';
import { usePwaInstall } from '@/hooks/pwa/usePwaInstall';

interface PwaInstallButtonProps {
  variant?: 'navbar' | 'landing';
}

export function PwaInstallButton({ variant = 'navbar' }: PwaInstallButtonProps) {
  const {
    canInstall,
    install,
    installUnavailableReason,
    isInstalled,
    isIos,
    isPrompting,
  } = usePwaInstall();

  if (isInstalled && variant === 'navbar') return null;

  const title = isInstalled
    ? 'Додаток встановлено'
    : isIos && !canInstall
      ? 'Встановіть через Поділитися'
      : 'Встановити додаток';

  const handleClick = async () => {
    await install();
  };

  if (variant === 'landing') {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={isPrompting || isInstalled}
          className="font-tech group relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white font-medium text-sm sm:text-base border border-white/10 hover:border-[#6366f1]/50 shadow-sm hover:shadow-[0_0_35px_rgba(99,102,241,0.25)] transition-all duration-300 active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPrompting ? (
            <LoaderCircle className="w-5 h-5 shrink-0 text-[#8d96e9] animate-spin" />
          ) : isInstalled ? (
            <Check className="w-5 h-5 shrink-0 text-[#8d96e9]" />
          ) : (
            <Download className="w-5 h-5 shrink-0 text-[#8d96e9]" />
          )}

          <span>
            {isPrompting ? 'Відкриваємо...' : isInstalled ? 'Встановлено' : 'Встановити'}
          </span>
        </button>

        {installUnavailableReason && (
          <p className="max-w-[260px] text-center text-xs leading-5 text-gray-400">
            {installUnavailableReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPrompting}
      title={installUnavailableReason || title}
      aria-label={title}
      className="p-2 rounded-lg border transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.08] hover:border-white/20"
    >
      {isPrompting ? (
        <LoaderCircle className="w-5 h-5 shrink-0 text-[#8d96e9] animate-spin" />
      ) : (
        <Download className="w-5 h-5 shrink-0 text-[#8d96e9]" />
      )}
    </button>
  );
}

export default PwaInstallButton;
