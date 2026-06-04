"use client";

import { useState } from "react";

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
 * never grow into an endless scroll. Includes prev/next buttons and a
 * "jump to page" input. Renders nothing when there is only one page.
 */
export function Pagination({ page, totalPages, total, unitZh = "条", unitEn = "items", onChange }: PaginationProps) {
  const { isDark, t } = useSettings();
  const [jumpValue, setJumpValue] = useState("");

  if (totalPages <= 1) return null;

  const buttonClass = isDark
    ? "rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    : "rounded-lg border border-black/[0.08] bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

  const inputClass = isDark
    ? "h-8 w-16 rounded-lg border border-white/10 bg-white/[0.05] px-2 text-center text-sm text-slate-200 outline-none focus:border-white/25"
    : "h-8 w-16 rounded-lg border border-black/[0.08] bg-white px-2 text-center text-sm text-slate-700 outline-none focus:border-black/25";

  function handleJump() {
    const parsed = Number.parseInt(jumpValue, 10);
    if (Number.isNaN(parsed)) return;
    const target = Math.min(Math.max(parsed, 1), totalPages);
    if (target !== page) onChange(target);
    setJumpValue("");
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 pt-5">
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

      <span className={`h-5 w-px ${isDark ? "bg-white/10" : "bg-black/10"}`} aria-hidden="true" />

      <div className="flex items-center gap-2">
        <span className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("跳至", "Go to")}</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(event) => setJumpValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleJump();
            }
          }}
          placeholder={String(page)}
          aria-label={t("输入页码", "Page number")}
          className={inputClass}
        />
        <span className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("页", "")}</span>
        <button type="button" onClick={handleJump} className={buttonClass}>
          {t("跳转", "Go")}
        </button>
      </div>
    </div>
  );
}
