"use client";

import type { DashboardStats } from "@/lib/actions/dashboard";
import { useSettings } from "@/lib/settings/context";

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
  const { mode, t } = useSettings();
  const isPremium = mode === "premium";
  const isDark = mode !== "light";

  const summaryCards = [
    {
      label: t("今日上传", "Today Uploads"),
      value: String(stats.todayUploads),
      note: t("今天新增的素材", "New assets today"),
      color: "from-blue-500 to-blue-600",
    },
    {
      label: t("素材总数", "Total Assets"),
      value: String(stats.totalAssets),
      note: t("素材库中的图片总量", "Total images in the asset library"),
      color: "from-emerald-500 to-teal-600",
    },
    {
      label: t("处理中任务", "Active Jobs"),
      value: String(stats.pendingJobs),
      note: t("等待或正在处理的任务", "Queued or processing jobs"),
      color: "from-violet-500 to-purple-600",
    },
    {
      label: t("商品草稿", "Product Drafts"),
      value: String(stats.totalDrafts),
      note: t("已创建的商品草稿数", "Created product drafts"),
      color: "from-amber-500 to-orange-600",
    },
  ];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className={
              isPremium
                ? "relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl"
                : `relative overflow-hidden rounded-xl border p-5 shadow-sm ${isDark ? "border-white/5 bg-[#12122a]" : "border-slate-200/60 bg-white"}`
            }
          >
            <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${card.color}`} />
            <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{card.label}</p>
            <p className={`mt-3 text-3xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{card.value}</p>
            <p className={`mt-2 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className={isPremium ? "rounded-[24px] border border-white/10 bg-white/[0.055] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl" : `rounded-xl border p-6 shadow-sm ${isDark ? "border-white/5 bg-[#12122a]" : "border-slate-200/60 bg-white"}`}>
          <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{t("批处理流程", "Batch Workflow")}</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {workflowItems.map((item, index) => (
              <div key={item.zh} className={`flex items-center gap-3 rounded-xl p-3 transition ${isDark ? "bg-white/[0.055] hover:bg-white/[0.08]" : "bg-slate-50 hover:bg-slate-100"}`}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 text-xs font-bold text-slate-950 shadow-sm">
                  {index + 1}
                </span>
                <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t(item.zh, item.en)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={isPremium ? "rounded-[24px] border border-white/10 bg-white/[0.055] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl" : `rounded-xl border p-6 shadow-sm ${isDark ? "border-white/5 bg-[#12122a]" : "border-slate-200/60 bg-white"}`}>
          <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{t("系统说明", "System Notes")}</h3>
          <div className={`mt-5 space-y-3 text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <p>{t("内部 POD 商品图批量处理系统。", "Internal POD product image batch processing system.")}</p>
            <p>{t("支持图片上传、批量处理、套图生成和导出功能。", "Supports image upload, batch processing, mockup generation, and export workflows.")}</p>
          </div>
        </section>
      </div>
    </>
  );
}
