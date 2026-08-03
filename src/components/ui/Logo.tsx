import Link from 'next/link';

export default function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 hover:opacity-95 transition-all group active:scale-95">
      <span className="font-tech text-base font-bold tracking-tight text-white flex items-center">
        Telegraf<span className="text-[#5e6ad2] font-black">.</span>
      </span>
    </Link>
  );
}
