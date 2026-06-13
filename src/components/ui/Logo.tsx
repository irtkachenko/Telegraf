import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 hover:opacity-95 transition-all group active:scale-95">
      <div className="w-5.5 h-5.5 rounded bg-gradient-to-br from-[#5e6ad2] to-[#4e5ac2] flex items-center justify-center shadow-md shadow-[#5e6ad2]/10 group-hover:scale-105 transition-transform">
        <span className="text-white text-[10px] font-black">T</span>
      </div>
      <span className="text-sm font-bold tracking-tight text-white flex items-center">
        Telegraf<span className="text-[#5e6ad2] font-black">.</span>
      </span>
    </Link>
  );
}
