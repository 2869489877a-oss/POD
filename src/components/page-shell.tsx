"use client";

import type { ReactNode } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

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
  const resolvedTitle = titleZh && titleEn ? t(titleZh, titleEn) : title ?? "";
  const resolvedDescription =
    descriptionZh && descriptionEn ? t(descriptionZh, descriptionEn) : description ?? "";

  return (
    <section className="space-y-6 animate-fade-in">
      <div
        className={
          isDark
            ? "relative overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl"
            : "relative overflow-hidden rounded-[22px] border border-black/[0.05] bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.04)] backdrop-blur-xl"
        }
      >
        {/* Top border glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.primary}80, ${colors.primary}, ${colors.primary}80, transparent)`,
          }}
        />

        {/* Soft accent orb */}
        <div
          className="animate-float pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-70 blur-3xl"
          style={{ background: `radial-gradient(circle, ${colors.primary}40, transparent 70%)` }}
        />

        <div className="relative z-10">
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
            className={`mt-4 text-[32px] font-bold leading-tight tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}
          >
            {resolvedTitle}
          </h2>

          <p className={`mt-2 max-w-3xl text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {resolvedDescription}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
