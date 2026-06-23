"use client";

import Image from "next/image";
import Link from "next/link";

import type { DashboardStats } from "@/lib/actions/dashboard";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type ToolCard = {
  href: string;
  image: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  badgeZh?: string;
  badgeEn?: string;
};

const featuredTools: ToolCard[] = [
  {
    href: "/cutout",
    image: "/images/tool-cutout.png",
    titleZh: "一键抠图",
    titleEn: "Background Removal",
    descZh: "批量移除商品图背景，输出透明底素材",
    descEn: "Batch remove backgrounds and export transparent assets",
    badgeZh: "批量",
    badgeEn: "Batch",
  },
  {
    href: "/print-extraction",
    image: "/images/tool-print-extract.png",
    titleZh: "印花提取",
    titleEn: "Print Extraction",
    descZh: "从成衣图中提取透明底印花设计图",
    descEn: "Extract transparent print artwork from garment photos",
    badgeZh: "核心",
    badgeEn: "Core",
  },
  {
    href: "/mockup-jobs",
    image: "/images/tool-mockup.png",
    titleZh: "套图生成",
    titleEn: "Mockup Generation",
    descZh: "一张设计图批量套用到多个商品模板",
    descEn: "Apply one design to multiple product templates",
    badgeZh: "批量",
    badgeEn: "Batch",
  },
  {
    href: "/ai-image",
    image: "/images/tool-ai-image.png",
    titleZh: "AI 图片",
    titleEn: "AI Image",
    descZh: "AI 生图、提取印花与印花换底",
    descEn: "AI generation, print extraction and re-backgrounding",
    badgeZh: "AI",
    badgeEn: "AI",
  },
];

type QuickLink = {
  href: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  icon: string;
};

const quickLinks: QuickLink[] = [
  {
    href: "/upload",
    titleZh: "上传图片",
    titleEn: "Upload",
    descZh: "原图 / 透明印花 / 胚衣底图",
    descEn: "Originals, prints and garment bases",
    icon: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5",
  },
  {
    href: "/assets",
    titleZh: "素材库",
    titleEn: "Assets",
    descZh: "管理与筛选全部素材",
    descEn: "Manage and filter all assets",
    icon: "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z",
  },
  {
    href: "/infringement-check",
    titleZh: "侵权检测",
    titleEn: "IP Check",
    descZh: "版权与商标风险复核",
    descEn: "Copyright and trademark review",
    icon: "M9 12.75 11.25 15 15 9.75M21 12c0 5.25-3.75 9-9 10.5C6.75 21 3 17.25 3 12V5.25L12 2.25l9 3v6.75Z",
  },
  {
    href: "/products",
    titleZh: "商品草稿",
    titleEn: "Products",
    descZh: "管理待导出商品",
    descEn: "Manage product drafts",
    icon: "m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
  },
  {
    href: "/image-jobs",
    titleZh: "图片任务",
    titleEn: "Image Jobs",
    descZh: "查看批处理任务进度",
    descEn: "Track batch job progress",
    icon: "M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0L21.75 16.5 12 21.75 2.25 16.5l4.179-2.25m0 0 5.571 3 5.571-3",
  },
  {
    href: "/exports",
    titleZh: "导出",
    titleEn: "Export",
    descZh: "导出 Excel 与图片 ZIP",
    descEn: "Export Excel and image ZIP",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  },
];

const workflowSteps = [
  { zh: "采集 / 上传素材", en: "Collect / upload assets" },
  { zh: "侵权检测过滤", en: "IP risk filtering" },
  { zh: "抠图与印花提取", en: "Cutout & print extraction" },
  { zh: "批量套图生成", en: "Batch mockup generation" },
  { zh: "商品草稿与导出", en: "Drafts & export" },
];

export function HomeHub({ stats }: { stats: DashboardStats }) {
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  const cardClass = isDark
    ? "rounded-[10px] border border-white/[0.08] bg-[#0f0f10]"
    : "rounded-[10px] border border-black/[0.08] bg-white";

  const statItems = [
    { label: t("今日上传", "Today's uploads"), value: stats.todayUploads },
    { label: t("素材总数", "Total assets"), value: stats.totalAssets },
    { label: t("处理中任务", "Active jobs"), value: stats.pendingJobs },
    { label: t("商品草稿", "Product drafts"), value: stats.totalDrafts },
  ];

  return (
    <div className="ui-page-enter flex flex-col gap-8">
      {/* Hero */}
      <section className="ui-ambient-panel relative overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950">
        <Image
          src="/images/hero-tech.png"
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1400px"
          className="object-cover object-right opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/90 to-[#0a0a0a]/30" />
        <div className="relative z-10 flex flex-col items-start gap-4 px-6 py-8 sm:px-9 sm:py-10 lg:max-w-[60%]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-300">
            <span className="ui-metric-dot h-1.5 w-1.5 rounded-full bg-emerald-400 text-emerald-400" />
            {t("全流程批量处理管线", "End-to-end batch pipeline")}
          </span>
          <h1 className="text-2xl font-semibold leading-[1.2] tracking-tight text-white sm:text-3xl">
            {t("让每一张商品图", "Automate every product image,")}
            <br />
            {t("自动完成生产", "end to end")}
          </h1>
          <p className="max-w-lg text-pretty text-sm leading-relaxed text-zinc-400">
            {t(
              "从素材采集、侵权过滤、抠图提取到批量套图与导出，POD 商品图的完整生产线。",
              "From asset collection and IP filtering to cutout, extraction, batch mockups and export.",
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/upload"
              className="ui-press inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: colors.primary }}
            >
              {t("开始上传素材", "Start uploading")}
            </Link>
            <Link
              href="/dashboard"
              className="ui-press inline-flex h-9 items-center rounded-md border border-white/15 bg-white/[0.04] px-4 text-[13px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.08]"
            >
              {t("查看仪表盘", "View dashboard")}
            </Link>
          </div>

          {/* Stats strip */}
          <dl className="ui-stagger mt-2 flex flex-wrap gap-x-8 gap-y-3">
            {statItems.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <dt className="text-[11px] text-zinc-500">{item.label}</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums text-white">
                  {item.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Featured tools */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className={`text-lg font-semibold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
              {t("核心处理工具", "Core processing tools")}
            </h2>
            <p className={`mt-1 text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {t("围绕 POD 商品图生产的四大核心能力", "Four core capabilities for POD image production")}
            </p>
          </div>
        </div>
        <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featuredTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={`ui-lift ui-hover-sheen group flex flex-col overflow-hidden transition-colors ${cardClass} ${
                isDark ? "hover:border-white/20" : "hover:border-black/20"
              }`}
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={tool.image || "/placeholder.svg"}
                  alt={t(tool.titleZh, tool.titleEn)}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                {tool.badgeZh ? (
                  <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white backdrop-blur">
                    {t(tool.badgeZh, tool.badgeEn ?? tool.badgeZh)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>
                  {t(tool.titleZh, tool.titleEn)}
                  <svg
                    className="h-3.5 w-3.5 -translate-x-0.5 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                    style={{ color: colors.primary }}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </h3>
                <p className={`text-pretty text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                  {t(tool.descZh, tool.descEn)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className={`ui-enter ui-delay-1 overflow-hidden ${cardClass}`}>
        <div className="flex flex-col gap-6 p-6 sm:p-8">
          <div>
            <h2 className={`text-lg font-semibold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
              {t("标准生产流程", "Standard production flow")}
            </h2>
            <p className={`mt-1 text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {t("五步完成从素材到可上架商品", "Five steps from raw asset to listable product")}
            </p>
          </div>
          <ol className="ui-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {workflowSteps.map((step, index) => (
              <li
                key={step.zh}
                className={`ui-lift ui-hover-sheen relative flex flex-col gap-2 rounded-lg border p-4 ${
                  isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-black/[0.06] bg-black/[0.02]"
                }`}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold text-white"
                  style={{ background: colors.primary }}
                >
                  {index + 1}
                </span>
                <p className={`text-[13px] font-medium leading-snug ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  {t(step.zh, step.en)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Quick links */}
      <section className="ui-enter ui-delay-2 flex flex-col gap-4">
        <h2 className={`text-lg font-semibold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
          {t("快捷入口", "Quick access")}
        </h2>
        <div className="ui-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`ui-lift ui-hover-sheen group flex items-center gap-3.5 p-4 transition-colors ${cardClass} ${
                isDark ? "hover:border-white/20" : "hover:border-black/20"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                  isDark ? "border-white/[0.08] bg-white/[0.04]" : "border-black/[0.08] bg-black/[0.03]"
                }`}
              >
                <svg
                  className="h-4.5 w-4.5 transition-colors"
                  style={{ color: colors.primary }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                </svg>
              </span>
              <div className="min-w-0">
                <h3 className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                  {t(link.titleZh, link.titleEn)}
                </h3>
                <p className={`truncate text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                  {t(link.descZh, link.descEn)}
                </p>
              </div>
              <svg
                className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${
                  isDark ? "text-zinc-600" : "text-zinc-400"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
