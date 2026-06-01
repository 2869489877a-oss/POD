"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-[#0d0d24] border-r border-violet-500/10">
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/20">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-400">Internal</p>
            <h1 className="text-sm font-bold text-white">POD 批处理</h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150",
                isActive
                  ? "bg-gradient-to-r from-violet-500/20 to-cyan-500/10 text-white shadow-sm shadow-violet-500/10 border border-violet-500/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent",
              ].join(" ")}
            >
              <svg
                className={[
                  "h-[18px] w-[18px] shrink-0",
                  isActive ? "text-violet-400" : "text-slate-500",
                ].join(" ")}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="font-medium">{item.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-violet-500/10 px-5 py-3">
        <p className="text-[11px] text-slate-600">v0.1.0 · 内部系统</p>
      </div>
    </aside>
  );
}
