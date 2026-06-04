"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { navItems } from "@/lib/navigation";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

const FALLBACK_ICON =
  "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z";

type PageShellProps = {
  title?: string;
  description?: string;
  titleZh?: string;
  titleEn?: string;
  descriptionZh?: string;
  descriptionEn?: string;
  children?: ReactNode;
};

export function PageShell({ title, description, titleZh, titleEn, descriptionZh, descriptionEn, children }: PageShellProps) {
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const pathname = usePathname();
  const resolvedTitle = titleZh && titleEn ? t(titleZh, titleEn) : title ?? "";
  const resolvedDescription =
    descriptionZh && descriptionEn ? t(descriptionZh, descriptionEn) : description ?? "";

  const icon = useMemo(() => {
    const match = navItems
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return match?.icon ?? FALLBACK_ICON;
  }, [pathname]);

  return (
    <section className="space-y-6 animate-fade-in">
      <div
        className={
          isDark
            ? "relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl"
            : "relative overflow-hidden rounded-[24px] border border-black/[0.05] bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.05)] backdrop-blur-xl"
        }
      >
        {/* Top border glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.primary}80, ${colors.primary}, ${colors.primary}80, transparent)`,
          }}
        />

        {/* Soft accent orbs */}
        <div
          className="animate-float pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${colors.primary}55, transparent 70%)` }}
        />
        <div
          className="pointer-events-none absolute -bottom-28 left-24 h-64 w-64 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${colors.primary}22, transparent 70%)` }}
        />

        <div className="relative z-10 flex items-start gap-5">
          {/* Icon chip */}
          <div
            className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg sm:flex"
            style={{
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}b0)`,
              boxShadow: `0 16px 36px ${colors.glow}`,
            }}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                isDark
                  ? "border border-white/[0.08] bg-white/[0.05]"
                  : "border border-black/[0.05] bg-black/[0.03]"
              }`}
              style={{ color: colors.primary }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse-glow"
                style={{ background: colors.primary }}
              />
              {t("POD 工作台", "POD Workspace")}
            </span>

            <h2
              className="gradient-text mt-4 text-[34px] font-extrabold leading-tight tracking-tight md:text-[40px]"
              style={{
                backgroundImage: `linear-gradient(100deg, ${isDark ? "#ffffff" : "#0f172a"} 35%, ${colors.primary})`,
              }}
            >
              {resolvedTitle}
            </h2>

            <p className={`mt-2.5 max-w-3xl text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {resolvedDescription}
            </p>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
