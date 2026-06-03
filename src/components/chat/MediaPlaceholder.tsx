'use client';

import { FileX, ImageOff } from 'lucide-react';

interface MediaPlaceholderProps {
  reason?: 'deleted' | 'error';
  isLoading?: boolean;
}

export function MediaPlaceholder({ reason = 'deleted', isLoading = false }: MediaPlaceholderProps) {
  if (isLoading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center z-10 min-h-[150px]">
        <div className="w-5 h-5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
          Завантаження...
        </p>
      </div>
    );
  }

  const Icon = reason === 'deleted' ? FileX : ImageOff;
  const text = reason === 'deleted' ? 'Видалено' : 'Помилка';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/5 rounded-xl p-4 text-center z-10 min-h-[150px]">
      <Icon className="w-5 h-5 text-neutral-500 mb-2" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{text}</p>
    </div>
  );
}