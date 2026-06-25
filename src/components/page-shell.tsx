"use client";

import type { ReactNode } from "react";

import { useSettings } from "@/lib/settings/context";

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
  const { isDark, t } = useSettings();
  const resolvedTitle = titleZh && titleEn ? t(titleZh, titleEn) : title ?? "";
  const resolvedDescription =
    descriptionZh && descriptionEn ? t(descriptionZh, descriptionEn) : description ?? "";

  return (
    <section className="animate-fade-in space-y-6">
      <header className={`ui-page-header ui-holo-header border-b pb-6 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`ui-kicker text-[11px] font-medium uppercase tracking-[0.14em] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {t("POD 工作台", "POD Workspace")}
            </p>
            <h2 className={`mt-1.5 text-balance text-[28px] font-semibold leading-tight tracking-tight md:text-[32px] ${isDark ? "text-white" : "text-zinc-900"}`}>
              {resolvedTitle}
            </h2>
            {resolvedDescription ? (
              <p className={`mt-2 max-w-3xl text-pretty text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {resolvedDescription}
              </p>
            ) : null}
          </div>
          <div className={`ui-live-chip hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium md:flex ${isDark ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200" : "border-cyan-500/20 bg-cyan-50 text-cyan-700"}`}>
            <span className="ui-activity ui-activity-sm" aria-hidden="true" />
            <span>{t("实时工作流", "Live Workflow")}</span>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}
