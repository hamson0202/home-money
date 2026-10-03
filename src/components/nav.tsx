"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "每月對帳" },
  { href: "/households", label: "住戶管理" },
  { href: "/history", label: "歷史紀錄" },
  { href: "/settings", label: "設定備份" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4">
        <span className="hidden shrink-0 py-3 font-bold text-emerald-700 sm:block">管理費對帳</span>
        <nav className="flex flex-1 justify-between gap-1 sm:justify-end">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`border-b-2 px-2 py-3 text-sm font-medium whitespace-nowrap sm:text-base ${
                  active
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
