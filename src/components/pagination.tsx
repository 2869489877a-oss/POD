"use client";

import { useSettings } from "@/lib/settings/context";

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  unitZh?: string;
  unitEn?: string;
  onChange: (page: number) => void;
};

/**
 * Shared pagination control used across list pages so they look consistent and
 * never grow into an endless scroll. Renders nothing when there is only one page.
 */
export function Pagination({ page, totalPages, total, unitZh = "条", unitEn = "items", onChange }: PaginationProps) {
  const { isDark, t } = useSettings();

  if (totalPages <= 1) return null;

  const buttonClass = isDark
    ? "rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    : "rounded-lg border border-black/[0.08] bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-5">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={buttonClass}
      >
        {t("上一页", "Previous")}
      </button>
      <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
        {t(`第 ${page} / ${totalPages} 页（共 ${total} ${unitZh}）`, `Page ${page} / ${totalPages} (${total} ${unitEn})`)}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={buttonClass}
      >
        {t("下一页", "Next")}
      </button>
    </div>
  );
}
