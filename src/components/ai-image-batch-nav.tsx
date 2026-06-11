"use client";

import Link from "next/link";

import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";

export function AiImageBatchNav() {
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  return (
    <div className="flex justify-end">
      <Link
        href="/ai-image"
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
          isDark
            ? "border-white/[0.08] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
            : "border-black/[0.06] bg-white/80 text-slate-700 hover:bg-white"
        }`}
        style={{ boxShadow: isDark ? `0 12px 36px ${colors.glow}` : undefined }}
      >
        <span aria-hidden="true">←</span>
        {t("返回单图页面", "Back to Single Image")}
      </Link>
    </div>
  );
}
