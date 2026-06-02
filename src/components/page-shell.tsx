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
  const isDark = mode === "dark";
  const resolvedTitle = titleZh && titleEn ? t(titleZh, titleEn) : title ?? "";
  const resolvedDescription =
    descriptionZh && descriptionEn ? t(descriptionZh, descriptionEn) : description ?? "";

  return (
    <section className="space-y-6">
      <div className="pb-5">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${isDark ? `bg-gradient-to-r from-${accent}-500/10 to-cyan-500/10 ring-${accent}-500/20` : `bg-${accent}-50 ring-${accent}-200/60`}`} style={{ color: colors.primary }}>
          {t("POD 工作台", "POD Workspace")}
        </span>
        <h2 className={`mt-3 text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{resolvedTitle}</h2>
        <p className={`mt-2 max-w-3xl text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>{resolvedDescription}</p>
      </div>
      {children}
    </section>
  );
}
