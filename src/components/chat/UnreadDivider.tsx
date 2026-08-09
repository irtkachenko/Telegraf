'use client';

/**
 * Горизонтальний розділювач непрочитаних повідомлень.
 * Відображається безпосередньо перед першим новим повідомленням у стрічці чату.
 */
export function UnreadDivider() {
  return (
    <div className="relative flex items-center justify-center w-full py-3" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px bg-[#3390ec]/25" />
      <span className="relative px-4 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest text-[#3390ec] bg-[#0c0d0f] border border-[#3390ec]/30 shadow-[0_0_12px_rgba(51,144,236,0.25)]">
        Нові повідомлення
      </span>
    </div>
  );
}
