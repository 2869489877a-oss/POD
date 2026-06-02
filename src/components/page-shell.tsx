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
  const { mode, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isPremium = mode === "premium";
  const isDark = mode !== "light";
  const resolvedTitle = titleZh && titleEn ? t(titleZh, titleEn) : title ?? "";
  const resolvedDescription =
    descriptionZh && descriptionEn ? t(descriptionZh, descriptionEn) : description ?? "";

  return (
    <section className="space-y-6">
      <div
        className={
          isPremium
            ? "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.085),rgba(255,255,255,0.04))] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur-xl"
            : "pb-5"
        }
      >
        <span
          className={
            isPremium
              ? "inline-flex h-8 items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 text-xs font-black text-emerald-100"
              : `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${isDark ? `bg-gradient-to-r from-${accent}-500/10 to-cyan-500/10 ring-${accent}-500/20` : `bg-${accent}-50 ring-${accent}-200/60`}`
          }
          style={{ color: isPremium ? undefined : colors.primary }}
        >
          {isPremium && <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(32,227,162,0.9)]" />}
          {isPremium ? t("AI PRINT STUDIO", "AI PRINT STUDIO") : t("POD 工作台", "POD Workspace")}
        </span>
        <h2 className={`${isPremium ? "mt-4 text-[42px] leading-none" : "mt-3 text-2xl"} font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{resolvedTitle}</h2>
        <p className={`${isPremium ? "mt-3 max-w-4xl text-[15px] text-slate-400" : `mt-2 max-w-3xl text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`} leading-6`}>{resolvedDescription}</p>
      </div>
      {children}
    </section>
  );
}
