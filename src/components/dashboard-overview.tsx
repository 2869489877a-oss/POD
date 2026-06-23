"use client";

import Image from "next/image";

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
      dot: "#3b82f6",
    },
    {
      label: t("素材总数", "Total Assets"),
      value: String(stats.totalAssets),
      note: t("素材库中的图片总量", "Total images in the asset library"),
      dot: "#10b981",
    },
    {
      label: t("处理中任务", "Active Jobs"),
      value: String(stats.pendingJobs),
      note: t("等待或正在处理的任务", "Queued or processing jobs"),
      dot: "#f59e0b",
    },
    {
      label: t("商品草稿", "Product Drafts"),
      value: String(stats.totalDrafts),
      note: t("已创建的商品草稿数", "Created product drafts"),
      dot: "#f43f5e",
    },
  ];

  const cardClass = isDark
    ? "rounded-[10px] border border-white/[0.08] bg-[#0f0f10] transition-colors duration-150 hover:border-white/[0.16]"
    : "rounded-[10px] border border-black/[0.08] bg-white transition-colors duration-150 hover:border-black/[0.16]";

  return (
    <>
      {/* Hero banner */}
      <section
        className={`ui-enter relative overflow-hidden rounded-[10px] border ${
          isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-black/[0.08] bg-zinc-950"
        }`}
      >
        <Image
          src="/images/hero-tech.png"
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1200px"
          className="object-cover object-right opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-transparent" />
        <div className="relative flex flex-col gap-3 px-6 py-8 sm:px-8 sm:py-10 lg:max-w-[60%]">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-zinc-300"
            >
              {t("内部系统", "Internal")}
            </span>
            <span className="font-mono text-[11px] text-zinc-500">POD PIPELINE</span>
          </div>
          <h2 className="text-balance text-xl font-semibold leading-tight tracking-tight text-white sm:text-2xl">
            {t("POD 商品图批量处理中心", "POD Product Image Batch Center")}
          </h2>
          <p className="max-w-md text-pretty text-[13px] leading-relaxed text-zinc-400">
            {t(
              "从素材上传到批量处理、套图生成与导出，全流程自动化的商品图生产管线。",
              "An automated pipeline from asset upload to batch processing, mockup generation, and export.",
            )}
          </p>
        </div>
      </section>

      <div className="ui-stagger grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => (
          <div
            key={card.label}
            className={`ui-lift p-5 ${cardClass}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: card.dot }} />
              <p className={`text-[13px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                {card.label}
              </p>
            </div>
            <p className={`mt-3 text-[32px] font-semibold leading-none tracking-tight tabular-nums ${isDark ? "text-white" : "text-zinc-900"}`}>
              {card.value}
            </p>
            <p className={`mt-2.5 text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              {card.note}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className={`ui-enter ui-delay-1 p-6 ${cardClass}`}>
          <h3 className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>
            {t("批处理流程", "Batch Workflow")}
          </h3>
          <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {workflowItems.map((item, index) => (
              <div
                key={item.zh}
                className={`ui-reveal-right flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors duration-150 ${
                  isDark
                    ? "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                    : "border-black/[0.06] bg-black/[0.01] hover:border-black/[0.12]"
                }`}
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold tabular-nums ${
                    isDark ? "bg-white/[0.08] text-zinc-300" : "bg-black/[0.06] text-zinc-600"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`flex-1 text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  {t(item.zh, item.en)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={`ui-enter ui-delay-2 relative overflow-hidden p-6 ${cardClass}`}>
          <Image
            src="/images/workflow-tech.png"
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 480px"
            className="object-cover opacity-30"
          />
          <div
            className={`absolute inset-0 ${
              isDark
                ? "bg-gradient-to-t from-[#0f0f10] via-[#0f0f10]/80 to-[#0f0f10]/40"
                : "bg-gradient-to-t from-white via-white/85 to-white/60"
            }`}
          />
          <div className="relative">
          <h3 className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>
            {t("系统说明", "System Notes")}
          </h3>
          <div className={`mt-4 space-y-2.5 text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <p>{t("内部 POD 商品图批量处理系统。", "Internal POD product image batch processing system.")}</p>
            <p>{t("支持图片上传、批量处理、套图生成和导出功能。", "Supports image upload, batch processing, mockup generation, and export workflows.")}</p>
          </div>
          <div className={`mt-5 flex items-center gap-2 rounded-md border px-3 py-2 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-black/[0.06] bg-black/[0.01]"}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.primary }} />
            <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {t("数据每次进入页面时自动刷新", "Stats refresh on every page load")}
            </p>
          </div>
          </div>
        </section>
      </div>
    </>
  );
}
