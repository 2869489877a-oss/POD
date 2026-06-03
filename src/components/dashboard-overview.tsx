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
    },
    {
      label: t("素材总数", "Total Assets"),
      value: String(stats.totalAssets),
      note: t("素材库中的图片总量", "Total images in the asset library"),
      gradient: "from-emerald-500 to-teal-600",
      glow: "rgba(16,185,129,0.3)",
    },
    {
      label: t("处理中任务", "Active Jobs"),
      value: String(stats.pendingJobs),
      note: t("等待或正在处理的任务", "Queued or processing jobs"),
      gradient: "from-violet-500 to-purple-600",
      glow: "rgba(139,92,246,0.3)",
    },
    {
      label: t("商品草稿", "Product Drafts"),
      value: String(stats.totalDrafts),
      note: t("已创建的商品草稿数", "Created product drafts"),
      gradient: "from-amber-500 to-orange-600",
      glow: "rgba(245,158,11,0.3)",
    },
  ];

  const cardBase = isDark
    ? "relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
    : "relative overflow-hidden rounded-[20px] border border-black/[0.05] bg-white/80 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.08)]";

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
              className="pointer-events-none absolute -top-12 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: card.glow }}
            />

            <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {card.label}
            </p>
            <p
              className={`gradient-text mt-3 bg-gradient-to-r ${card.gradient} text-3xl font-bold`}
            >
              {card.value}
            </p>
            <p className={`mt-2 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
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
                className={`flex items-center gap-3 rounded-xl p-3 transition-all duration-200 ${
                  isDark
                    ? "bg-white/[0.04] hover:bg-white/[0.07]"
                    : "bg-black/[0.02] hover:bg-black/[0.04]"
                }`}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}cc)`,
                    boxShadow: `0 4px 12px ${colors.glow}`,
                  }}
                >
                  {index + 1}
                </span>
                <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {t(item.zh, item.en)}
                </span>
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
