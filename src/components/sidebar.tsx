"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "@/lib/navigation";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

export function Sidebar() {
  const pathname = usePathname();
  const { mode, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isPremium = mode === "premium";
  const isDark = mode !== "light";

  return (
    <aside
      className={
        isPremium
          ? "sticky top-4 flex h-[calc(100vh-2rem)] w-72 shrink-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] shadow-[0_32px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
          : `sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r ${isDark ? "bg-[#0d0d24] border-white/5" : "bg-white border-slate-200"}`
      }
    >
      {isPremium && <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(32,227,162,0.16),transparent_18%,transparent_78%,rgba(246,198,106,0.1))]" />}
      <div className={isPremium ? "relative z-10 border-b border-white/10 px-5 py-6" : "px-5 py-5"}>
        <div className={isPremium ? "flex items-center gap-3.5" : "flex items-center gap-2.5"}>
          <div
            className={
              isPremium
                ? "flex h-14 w-14 items-center justify-center rounded-[17px] bg-gradient-to-br from-emerald-300 via-cyan-300 to-amber-300 text-slate-950 shadow-[0_18px_46px_rgba(32,227,162,0.28)]"
                : `flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${colors.gradient} shadow-lg ${colors.shadow}`
            }
          >
            <svg className={isPremium ? "h-7 w-7" : "h-4.5 w-4.5 text-white"} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <p className={isPremium ? "text-xs font-black uppercase tracking-[0.14em] text-amber-300" : "text-[11px] font-semibold uppercase tracking-wider"} style={{ color: isPremium ? undefined : colors.primary }}>Internal</p>
            <h1 className={`${isPremium ? "mt-0.5 text-xl" : "text-sm"} font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{t("POD 批处理", "POD Batch")}</h1>
          </div>
        </div>
      </div>

      <nav className={isPremium ? "relative z-10 flex-1 space-y-1.5 overflow-y-auto px-3.5 py-4" : "flex-1 space-y-0.5 overflow-y-auto px-3 py-2"}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                isPremium
                  ? "flex h-11 items-center gap-3 rounded-2xl border px-3.5 text-sm font-semibold transition-all duration-150"
                  : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150 border",
                isPremium
                  ? isActive
                    ? "border-emerald-300/30 bg-gradient-to-r from-emerald-400/25 to-cyan-300/10 text-white shadow-[inset_3px_0_0_#20e3a2,0_14px_36px_rgba(32,227,162,0.11)]"
                    : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.055] hover:text-white"
                  : isActive
                    ? `bg-gradient-to-r ${colors.gradient.replace("from-", "from-").replace("to-", "to-")}/10 ${isDark ? "text-white" : "text-slate-900"} shadow-sm ${colors.border}`
                    : `${isDark ? "text-slate-400 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"} border-transparent`,
              ].join(" ")}
            >
              <svg
                className={isPremium ? "h-5 w-5 shrink-0" : "h-[18px] w-[18px] shrink-0"}
                style={{ color: isActive ? (isPremium ? "#20e3a2" : colors.primary) : undefined }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="font-medium">{t(item.titleZh, item.titleEn)}</span>
            </Link>
          );
        })}
      </nav>

      <div className={isPremium ? "relative z-10 m-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4" : `border-t px-5 py-3 ${isDark ? "border-white/5" : "border-slate-200"}`}>
        {isPremium ? (
          <>
            <p className="text-xs font-semibold text-slate-500">Workspace Status</p>
            <p className="mt-1 text-sm font-bold text-emerald-100">{t("AI Studio Ready", "AI Studio Ready")}</p>
          </>
        ) : (
          <p className={`text-[11px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>v0.1.0 · {t("内部系统", "Internal")}</p>
        )}
      </div>
    </aside>
  );
}
