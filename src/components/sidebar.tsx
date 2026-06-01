"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "@/lib/navigation";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

export function Sidebar() {
  const pathname = usePathname();
  const { mode, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode === "dark";

  return (
    <aside className={`sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r ${isDark ? "bg-[#0d0d24] border-white/5" : "bg-white border-slate-200"}`}>
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${colors.gradient} shadow-lg ${colors.shadow}`}>
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: colors.primary }}>Internal</p>
            <h1 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{t("POD 批处理", "POD Batch")}</h1>
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
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 border",
                isActive
                  ? `bg-gradient-to-r ${colors.gradient.replace("from-", "from-").replace("to-", "to-")}/10 ${isDark ? "text-white" : "text-slate-900"} shadow-sm ${colors.border}`
                  : `${isDark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"} border-transparent`,
              ].join(" ")}
            >
              <svg
                className="h-[18px] w-[18px] shrink-0"
                style={{ color: isActive ? colors.primary : undefined }}
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

      <div className={`border-t px-5 py-3 ${isDark ? "border-white/5" : "border-slate-200"}`}>
        <p className={`text-[11px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>v0.1.0 · {t("内部系统", "Internal")}</p>
      </div>
    </aside>
  );
}
