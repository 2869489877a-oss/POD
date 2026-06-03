"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "@/lib/navigation";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

export function Sidebar() {
  const pathname = usePathname();
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  return (
    <aside
      className={
        isDark
          ? "sticky top-3 flex h-[calc(100vh-1.5rem)] w-[270px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_28px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
          : "sticky top-3 flex h-[calc(100vh-1.5rem)] w-[270px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-black/[0.06] bg-white/80 shadow-[0_28px_80px_rgba(0,0,0,0.06)] backdrop-blur-2xl"
      }
    >
      {/* Top glow accent */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{
          background: isDark
            ? `linear-gradient(180deg, ${colors.glow.replace("0.4", "0.1")}, transparent)`
            : `linear-gradient(180deg, ${colors.glow.replace("0.4", "0.06")}, transparent)`,
        }}
      />

      {/* Logo area */}
      <div className={`relative z-10 px-5 py-5 ${isDark ? "border-b border-white/[0.06]" : "border-b border-black/[0.04]"}`}>
        <div className="flex items-center gap-3">
          <div
            className="animate-breathe flex h-11 w-11 items-center justify-center rounded-[14px] shadow-lg"
            style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}dd)` }}
          >
            <svg className="h-5.5 w-5.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: colors.primary }}>
              Internal
            </p>
            <h1 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {t("POD 批处理", "POD Batch")}
            </h1>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-all duration-200",
                isActive
                  ? isDark
                    ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                    : "bg-black/[0.04] text-slate-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                  : isDark
                    ? "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                    : "text-slate-500 hover:bg-black/[0.03] hover:text-slate-900",
              ].join(" ")}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                  style={{
                    background: colors.primary,
                    boxShadow: `0 0 12px ${colors.glow}`,
                  }}
                />
              )}

              <svg
                className="h-[18px] w-[18px] shrink-0 transition-colors duration-200"
                style={{ color: isActive ? colors.primary : undefined }}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span>{t(item.titleZh, item.titleEn)}</span>

              {/* Hover shimmer */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div
                  className="animate-shimmer absolute inset-0"
                  style={{
                    background: isDark
                      ? "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)"
                      : "linear-gradient(90deg, transparent, rgba(0,0,0,0.02), transparent)",
                  }}
                />
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom status */}
      <div className={`relative z-10 mx-3 mb-3 rounded-xl p-3.5 ${isDark ? "border border-white/[0.06] bg-white/[0.03]" : "border border-black/[0.04] bg-black/[0.02]"}`}>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="h-2 w-2 rounded-full" style={{ background: colors.primary }} />
            <div className="animate-pulse-glow absolute inset-0 rounded-full" style={{ background: colors.primary, filter: "blur(3px)" }} />
          </div>
          <div>
            <p className={`text-[10px] font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {t("系统状态", "System Status")}
            </p>
            <p className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("在线运行中", "Online")}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
