"use client";

import type { DashboardStats } from "@/lib/actions/dashboard";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type Props = {
  stats: DashboardStats;
};

const workflowItems = [
  { zh: "上传图片", en: "Upload images" },
  { zh: "整理素材库", en: "Organize assets" },
  { zh: "批量图片处理", en: "Batch process images" },
  { zh: "生成固定商品套图", en: "Generate product mockups" },
  { zh: "管理商品草稿", en: "Manage product drafts" },
  { zh: "导出 Excel 和图片 ZIP", en: "Export Excel and image ZIP" },
];

export function DashboardOverview({ stats }: Props) {
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  const summaryCards = [
    {
      label: t("今日上传", "Today Uploads"),
      value: String(stats.todayUploads),
      note: t("今天新增的素材", "New assets today"),
      gradient: "from-blue-500 to-indigo-600",
      glow: "rgba(59,130,246,0.3)",
      icon: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
    },
    {
      label: t("素材总数", "Total Assets"),
      value: String(stats.totalAssets),
      note: t("素材库中的图片总量", "Total images in the asset library"),
      gradient: "from-emerald-500 to-teal-600",
      glow: "rgba(16,185,129,0.3)",
      icon: "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z",
    },
    {
      label: t("处理中任务", "Active Jobs"),
      value: String(stats.pendingJobs),
      note: t("等待或正在处理的任务", "Queued or processing jobs"),
      gradient: "from-violet-500 to-purple-600",
      glow: "rgba(139,92,246,0.3)",
      icon: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    },
    {
      label: t("商品草稿", "Product Drafts"),
      value: String(stats.totalDrafts),
      note: t("已创建的商品草稿数", "Created product drafts"),
      gradient: "from-amber-500 to-orange-600",
      glow: "rgba(245,158,11,0.3)",
      icon: "m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
    },
  ];

  const cardBase = isDark
    ? "group animate-fade-in relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
    : "group animate-fade-in relative overflow-hidden rounded-[20px] border border-black/[0.05] bg-white/80 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-black/[0.1] hover:shadow-[0_24px_60px_rgba(0,0,0,0.08)]";

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => (
          <div
            key={card.label}
            className={cardBase}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {/* Top gradient bar */}
            <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${card.gradient}`} />

            {/* Hover glow */}
            <div
              className="pointer-events-none absolute -top-12 right-0 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              style={{ background: card.glow }}
            />

            <div className="relative flex items-start justify-between gap-3">
              <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {card.label}
              </p>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                style={{ boxShadow: `0 8px 20px ${card.glow}` }}
              >
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={card.icon} />
                </svg>
              </span>
            </div>
            <p
              className={`gradient-text relative mt-3 inline-block bg-gradient-to-r ${card.gradient} text-3xl font-bold tracking-tight`}
            >
              {card.value}
            </p>
            <p className={`relative mt-2 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {card.note}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section
          className={
            isDark
              ? "rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl"
              : "rounded-[20px] border border-black/[0.05] bg-white/80 p-6 backdrop-blur-xl"
          }
        >
          <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {t("批处理流程", "Batch Workflow")}
          </h3>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {workflowItems.map((item, index) => (
              <div
                key={item.zh}
                className={`group/step flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all duration-200 hover:translate-x-0.5 hover:border-[color:var(--accent-glow)] ${
                  isDark
                    ? "bg-white/[0.04] hover:bg-white/[0.07]"
                    : "bg-black/[0.02] hover:bg-black/[0.04]"
                }`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-md transition-transform duration-200 group-hover/step:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}cc)`,
                    boxShadow: `0 4px 12px ${colors.glow}`,
                  }}
                >
                  {index + 1}
                </span>
                <span className={`flex-1 text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {t(item.zh, item.en)}
                </span>
                <svg
                  className="h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition-all duration-200 group-hover/step:translate-x-0 group-hover/step:opacity-100"
                  style={{ color: colors.primary }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            ))}
          </div>
        </section>

        <section
          className={
            isDark
              ? "rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl"
              : "rounded-[20px] border border-black/[0.05] bg-white/80 p-6 backdrop-blur-xl"
          }
        >
          <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
            {t("系统说明", "System Notes")}
          </h3>
          <div className={`mt-5 space-y-3 text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <p>{t("内部 POD 商品图批量处理系统。", "Internal POD product image batch processing system.")}</p>
            <p>{t("支持图片上传、批量处理、套图生成和导出功能。", "Supports image upload, batch processing, mockup generation, and export workflows.")}</p>
          </div>
        </section>
      </div>
    </>
  );
}
