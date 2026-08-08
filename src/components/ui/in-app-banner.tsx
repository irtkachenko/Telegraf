'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { create } from 'zustand';

export interface NotificationPayload {
  id: string;
  chatId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
}

interface BannerStore {
  activeNotification: NotificationPayload | null;
  showNotification: (notification: Omit<NotificationPayload, 'id'>) => void;
  hideNotification: () => void;
}

// Synthesize pleasant Telegram-like chime using Web Audio API
function playChimeSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    // Telegram-like double-tone chime (E5 -> B5)
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc1.frequency.setValueAtTime(987.77, ctx.currentTime + 0.08); // B5

    osc2.frequency.setValueAtTime(1318.51, ctx.currentTime); // E6
    osc2.frequency.setValueAtTime(1975.53, ctx.currentTime + 0.08); // B6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {
    // Ignore audio context errors
  }
}

export const useInAppBannerStore = create<BannerStore>((set) => ({
  activeNotification: null,
  showNotification: (notification) => {
    const id = Math.random().toString(36).substring(2, 9);
    set({ activeNotification: { ...notification, id } });
  },
  hideNotification: () => set({ activeNotification: null }),
}));

let dismissTimer: NodeJS.Timeout | null = null;

export function showInAppBanner(notification: Omit<NotificationPayload, 'id'>) {
  if (dismissTimer) clearTimeout(dismissTimer);
  useInAppBannerStore.getState().showNotification(notification);
  dismissTimer = setTimeout(() => {
    useInAppBannerStore.getState().hideNotification();
  }, 4500);
}

export default function InAppBanner() {
  const router = useRouter();
  const { activeNotification, hideNotification } = useInAppBannerStore();

  if (!activeNotification) return null;

  const handleClick = () => {
    const chatId = activeNotification.chatId;
    hideNotification();
    if (chatId) {
      router.push(`/chat/${chatId}`);
    }
  };

  return (
    <div className="fixed top-3 left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none">
      <AnimatePresence>
        <motion.div
          key={activeNotification.id}
          initial={{ opacity: 0, y: -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={handleClick}
          className="pointer-events-auto w-full max-w-sm sm:max-w-md bg-[#12131a]/95 hover:bg-[#181924] border border-white/15 rounded-2xl p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl flex items-center gap-3.5 cursor-pointer group transition-all"
        >
          {/* Avatar */}
          <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0">
            <Image
              src={activeNotification.senderAvatar || '/default-avatar.png'}
              alt={activeNotification.senderName}
              fill
              className="object-cover"
              sizes="40px"
            />
          </div>

          {/* Text content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-white truncate font-tech tracking-wide">
                {activeNotification.senderName}
              </h4>
              <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 shrink-0">
                Зараз
              </span>
            </div>
            <p className="text-xs text-gray-300 truncate mt-0.5 font-normal leading-snug">
              {activeNotification.text}
            </p>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              hideNotification();
            }}
            className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
