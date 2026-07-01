"use client";

import Image from "next/image";
import Link from "next/link";

import type { DashboardStats } from "@/lib/actions/dashboard";
import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";

type Props = {
  stats: DashboardStats;
};

type Tone = "cyan" | "emerald" | "amber" | "rose";

const toneStyles: Record<
  Tone,
  {
    bar: string;
    border: string;
    glow: string;
    soft: string;
    text: string;
  }
> = {
  amber: {
    bar: "from-amber-300 via-orange-400 to-amber-500",
    border: "border-amber-300/25",
    glow: "shadow-amber-500/10",
    soft: "bg-amber-400/10",
    text: "text-amber-200",
  },
  cyan: {
    bar: "from-cyan-300 via-sky-400 to-blue-500",
    border: "border-cyan-300/25",
    glow: "shadow-cyan-500/10",
    soft: "bg-cyan-400/10",
    text: "text-cyan-200",
  },
  emerald: {
    bar: "from-emerald-300 via-teal-400 to-cyan-500",
    border: "border-emerald-300/25",
    glow: "shadow-emerald-500/10",
    soft: "bg-emerald-400/10",
    text: "text-emerald-200",
  },
  rose: {
    bar: "from-rose-300 via-red-400 to-orange-500",
    border: "border-rose-300/25",
    glow: "shadow-rose-500/10",
    soft: "bg-rose-400/10",
    text: "text-rose-200",
  },
};

const sparklineHeights = [34, 52, 44, 72, 58, 84, 66, 92, 73, 64, 88, 76];

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function statusLabel(value: number, okLabel: string, busyLabel: string) {
  return value > 0 ? busyLabel : okLabel;
}

export function DashboardOverview({ stats }: Props) {
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  const activeWork = stats.pendingJobs + stats.activeAiJobs;
  const failedWork = stats.failedJobs + stats.failedAiJobs + stats.failedAssets;
  const finishedWork = stats.completedJobs + stats.completedAiJobs + stats.processedAssets;
  const riskWork = stats.reviewChecks + stats.riskyChecks + stats.blockedChecks;
  const checkTotal = stats.clearChecks + stats.pendingChecks + riskWork;
  const assetReadyPercent = percent(stats.processedAssets, stats.totalAssets);
  const riskClearPercent = percent(stats.clearChecks, checkTotal);
  const draftReadyPercent = percent(stats.readyDrafts + stats.exportedDrafts, stats.totalDrafts);
  const productionScore = Math.max(
    8,
    Math.min(
      99,
      Math.round(
        assetReadyPercent * 0.38 +
          riskClearPercent * 0.24 +
          draftReadyPercent * 0.18 +
          (activeWork > 0 ? 12 : 20) -
          Math.min(18, failedWork * 2),
      ),
    ),
  );

  const cardClass = isDark
    ? "border-white/[0.08] bg-[#0f0f10]/92 text-white shadow-black/20"
    : "border-black/[0.08] bg-white text-zinc-950 shadow-zinc-200/70";
  const mutedText = isDark ? "text-zinc-400" : "text-zinc-500";
  const faintText = isDark ? "text-zinc-500" : "text-zinc-400";
  const panelMuted = isDark ? "bg-white/[0.035]" : "bg-zinc-950/[0.035]";

  const summaryCards = [
    {
      label: t("今日上新", "New Today"),
      note: t("上传入口的新增素材", "New assets from upload flows"),
      progress: percent(stats.todayUploads, Math.max(12, stats.todayUploads + 6)),
      tone: "cyan" as Tone,
      value: stats.todayUploads,
    },
    {
      label: t("素材战备", "Asset Readiness"),
      note: t(`已处理 ${assetReadyPercent}%`, `${assetReadyPercent}% processed`),
      progress: assetReadyPercent,
      tone: "emerald" as Tone,
      value: stats.totalAssets,
    },
    {
      label: t("任务队列", "Task Queue"),
      note: statusLabel(activeWork, t("当前空闲", "Idle now"), t("正在排队/处理", "Queued or running")),
      progress: percent(activeWork, Math.max(8, activeWork + finishedWork)),
      tone: activeWork > 0 ? ("amber" as Tone) : ("cyan" as Tone),
      value: activeWork,
    },
    {
      label: t("风险待办", "Risk Actions"),
      note: t(`清白率 ${riskClearPercent}%`, `${riskClearPercent}% cleared`),
      progress: percent(riskWork, Math.max(1, checkTotal)),
      tone: riskWork > 0 ? ("rose" as Tone) : ("emerald" as Tone),
      value: riskWork,
    },
  ];

  const pipeline = [
    {
      count: stats.todayUploads,
      detail: t("上传与采集入口", "Upload and collection intake"),
      label: t("素材进入", "Intake"),
      progress: percent(stats.todayUploads, Math.max(1, stats.todayUploads + stats.totalAssets)),
      tone: "cyan" as Tone,
    },
    {
      count: stats.pendingChecks + riskWork,
      detail: t("侵权检测与风险复核", "Infringement checks and review"),
      label: t("风险筛查", "Risk Scan"),
      progress: percent(stats.clearChecks, Math.max(1, checkTotal)),
      tone: riskWork > 0 ? ("amber" as Tone) : ("emerald" as Tone),
    },
    {
      count: activeWork,
      detail: t("抠图、印花、尺寸、AI", "Cutout, print, resize, AI"),
      label: t("图片处理", "Processing"),
      progress: percent(finishedWork, Math.max(1, finishedWork + activeWork + failedWork)),
      tone: activeWork > 0 ? ("amber" as Tone) : ("cyan" as Tone),
    },
    {
      count: stats.mockupOutputs,
      detail: t("套图模板与商品草稿", "Mockups and product drafts"),
      label: t("商品输出", "Output"),
      progress: draftReadyPercent,
      tone: "emerald" as Tone,
    },
  ];

  const operationRows = [
    {
      label: t("普通图片任务", "Image jobs"),
      meta: t(`${stats.pendingJobs} 个进行中`, `${stats.pendingJobs} active`),
      value: stats.completedJobs,
      tone: "cyan" as Tone,
    },
    {
      label: t("AI 生图任务", "AI image jobs"),
      meta: t(`${stats.activeAiJobs} 个进行中`, `${stats.activeAiJobs} active`),
      value: stats.completedAiJobs,
      tone: "emerald" as Tone,
    },
    {
      label: t("异常/失败", "Failures"),
      meta: t("需要人工复查", "Needs review"),
      value: failedWork,
      tone: failedWork > 0 ? ("rose" as Tone) : ("cyan" as Tone),
    },
  ];

  const quickLinks = [
    { href: "/upload", label: t("上传图片", "Upload") },
    { href: "/assets", label: t("素材库", "Assets") },
    { href: "/infringement-check", label: t("侵权检测", "Risk Check") },
    { href: "/image-jobs", label: t("图片任务", "Jobs") },
  ];

  return (
    <div className="space-y-5">
      <section className="dashboard-hero ui-enter relative overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#07090b] text-white shadow-2xl shadow-black/25">
        <Image
          src="/images/hero-tech.png"
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1400px"
          className="object-cover object-right opacity-[0.42]"
        />
        <div className="dashboard-grid absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#07090b_0%,rgba(7,9,11,0.94)_38%,rgba(7,9,11,0.58)_100%)]" />
        <div className="relative z-10 grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="dashboard-chip border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  {t("生产驾驶舱", "Production Cockpit")}
                </span>
                <span className="dashboard-chip border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
                  {t("实时任务流", "Live task flow")}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  POD OPERATIONS
                </span>
              </div>
              <h2 className="mt-5 max-w-2xl text-balance text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[42px] lg:text-[48px]">
                {t("把素材、风控、处理、出品压进一个工作台", "One cockpit for assets, risk, processing, and output")}
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-7 text-zinc-400">
                {t(
                  "参考 POD 平台常见的运营面板，把关键指标、队列状态和生产节点集中展示；动画只服务于状态反馈，避免拖慢页面。",
                  "Inspired by common POD operation dashboards: central KPIs, queue state, and production stages with lightweight status motion.",
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t("生产评分", "Production score"), value: `${productionScore}%` },
                { label: t("已处理素材", "Processed assets"), value: `${assetReadyPercent}%` },
                { label: t("草稿就绪", "Draft readiness"), value: `${draftReadyPercent}%` },
              ].map((item, index) => (
                <div
                  key={item.label}
                  className="dashboard-glass ui-hover-sheen rounded-[10px] border border-white/[0.08] px-4 py-3"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <p className="text-[11px] uppercase tracking-[0.13em] text-zinc-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-command-panel ui-hover-sheen relative overflow-hidden rounded-[10px] border border-white/[0.1] bg-white/[0.045] p-5 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">SYSTEM CORE</p>
                <h3 className="mt-1 text-lg font-semibold">{t("任务生产核心", "Task Production Core")}</h3>
              </div>
              <span className="ui-activity ui-activity-lg" aria-hidden="true" />
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="dashboard-core mx-auto">
                <div className="dashboard-core-ring" />
                <div className="dashboard-core-inner">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/80">
                    SCORE
                  </span>
                  <strong>{productionScore}</strong>
                  <span className="text-[11px] text-zinc-500">/ 100</span>
                </div>
              </div>

              <div className="space-y-3">
                {operationRows.map((row, index) => {
                  const tone = toneStyles[row.tone];
                  return (
                    <div
                      key={row.label}
                      className={`dashboard-row rounded-[10px] border ${tone.border} ${tone.soft} px-3 py-3`}
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{row.label}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">{row.meta}</p>
                        </div>
                        <p className={`text-xl font-semibold tabular-nums ${tone.text}`}>{formatNumber(row.value)}</p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`ui-progress-fill h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                          style={{ width: `${percent(row.value, Math.max(1, row.value + activeWork + failedWork))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="ui-press rounded-md border border-white/[0.08] bg-white/[0.045] px-3 py-2 text-center text-xs font-semibold text-zinc-200 hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="ui-stagger grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => {
          const tone = toneStyles[card.tone];
          return (
            <section
              key={card.label}
              className={`dashboard-metric ui-lift ui-hover-sheen rounded-[10px] border p-5 shadow-lg ${cardClass} ${tone.glow}`}
              style={{ animationDelay: `${index * 55}ms`, color: colors.primary }}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-[13px] font-medium ${mutedText}`}>{card.label}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.border} ${tone.soft} ${isDark ? tone.text : "text-zinc-700"}`}>
                    {card.progress}%
                  </span>
                </div>
                <p className={`mt-4 text-[34px] font-semibold leading-none tracking-tight tabular-nums ${isDark ? "text-white" : "text-zinc-950"}`}>
                  {formatNumber(card.value)}
                </p>
                <p className={`mt-2 text-xs ${faintText}`}>{card.note}</p>
                <div className={`mt-4 h-1.5 overflow-hidden rounded-full ${panelMuted}`}>
                  <div
                    className={`ui-progress-fill h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                    style={{ width: `${Math.max(4, card.progress)}%` }}
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className={`dashboard-panel ui-enter ui-delay-1 rounded-[10px] border p-5 shadow-lg ${cardClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${faintText}`}>
                PRODUCTION FLOW
              </p>
              <h3 className={`mt-1 text-lg font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                {t("生产管线", "Production Pipeline")}
              </h3>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-300" : "border-black/[0.08] bg-black/[0.03] text-zinc-600"}`}>
              {t("从素材到导出", "From assets to export")}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {pipeline.map((step, index) => {
              const tone = toneStyles[step.tone];
              return (
                <div
                  key={step.label}
                  className={`dashboard-pipeline-card ui-hover-sheen rounded-[10px] border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.025]" : "border-black/[0.07] bg-black/[0.015]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold ${tone.border} ${tone.soft} ${isDark ? tone.text : "text-zinc-700"}`}>
                          {index + 1}
                        </span>
                        <p className={`truncate text-sm font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                          {step.label}
                        </p>
                      </div>
                      <p className={`mt-2 text-xs leading-relaxed ${mutedText}`}>{step.detail}</p>
                    </div>
                    <p className={`text-2xl font-semibold tabular-nums ${isDark ? "text-white" : "text-zinc-950"}`}>
                      {formatNumber(step.count)}
                    </p>
                  </div>
                  <div className={`mt-4 h-2 overflow-hidden rounded-full ${panelMuted}`}>
                    <div
                      className={`ui-progress-fill h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                      style={{ width: `${Math.max(5, step.progress)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`dashboard-panel ui-enter ui-delay-2 rounded-[10px] border p-5 shadow-lg ${cardClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${faintText}`}>RISK & OUTPUT</p>
              <h3 className={`mt-1 text-lg font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                {t("风险与出品", "Risk and Output")}
              </h3>
            </div>
            <span className="ui-activity" aria-hidden="true" />
          </div>

          <div className="mt-5 space-y-4">
            <div className={`rounded-[10px] border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.025]" : "border-black/[0.07] bg-black/[0.015]"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                    {t("侵权检测状态", "Infringement status")}
                  </p>
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    {t("清白、待检、复核、风险分布", "Clear, pending, review, and risk distribution")}
                  </p>
                </div>
                <p className={`text-2xl font-semibold tabular-nums ${riskWork > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                  {formatNumber(riskWork)}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-md border border-white/[0.05]">
                {[
                  { label: t("清白", "Clear"), tone: "emerald" as Tone, value: stats.clearChecks },
                  { label: t("待检", "Pending"), tone: "cyan" as Tone, value: stats.pendingChecks },
                  { label: t("复核", "Review"), tone: "amber" as Tone, value: stats.reviewChecks },
                  { label: t("高危", "Risky"), tone: "rose" as Tone, value: stats.riskyChecks + stats.blockedChecks },
                ].map((item) => (
                  <div key={item.label} className={`border-r border-white/[0.05] p-3 last:border-r-0 ${toneStyles[item.tone].soft}`}>
                    <p className={`text-[11px] ${mutedText}`}>{item.label}</p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${isDark ? toneStyles[item.tone].text : "text-zinc-800"}`}>
                      {formatNumber(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-[10px] border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.025]" : "border-black/[0.07] bg-black/[0.015]"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                    {t("商品输出准备度", "Output readiness")}
                  </p>
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    {t("草稿、套图、导出进度", "Drafts, mockups, and export progress")}
                  </p>
                </div>
                <p className="text-2xl font-semibold tabular-nums text-cyan-300">{draftReadyPercent}%</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: t("草稿", "Drafts"), value: stats.totalDrafts },
                  { label: t("已就绪", "Ready"), value: stats.readyDrafts },
                  { label: t("已导出", "Exported"), value: stats.exportedDrafts },
                ].map((item) => (
                  <div key={item.label} className={`rounded-md px-3 py-2 ${panelMuted}`}>
                    <p className={`text-[11px] ${mutedText}`}>{item.label}</p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${isDark ? "text-white" : "text-zinc-950"}`}>
                      {formatNumber(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <section className={`dashboard-panel ui-enter ui-delay-3 rounded-[10px] border p-5 shadow-lg ${cardClass}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${faintText}`}>ACTIVITY</p>
              <h3 className={`mt-1 text-lg font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                {t("生产脉冲", "Production Pulse")}
              </h3>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-300" : "border-black/[0.08] bg-black/[0.03] text-zinc-600"}`}>
              {t("轻量动画", "Light motion")}
            </span>
          </div>

          <div className="dashboard-sparkline mt-6 flex h-36 items-end gap-2 rounded-[10px] border border-white/[0.06] bg-gradient-to-b from-cyan-400/[0.08] to-transparent p-4">
            {sparklineHeights.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="dashboard-spark-bar flex-1 rounded-t bg-gradient-to-t from-cyan-500 via-emerald-300 to-white"
                style={{
                  animationDelay: `${index * 75}ms`,
                  height: `${Math.min(96, Math.max(18, height + (stats.todayUploads % 6) * 3))}%`,
                  opacity: 0.28 + index * 0.045,
                }}
              />
            ))}
          </div>
        </section>

        <section className={`dashboard-panel ui-enter ui-delay-4 relative overflow-hidden rounded-[10px] border p-5 shadow-lg ${cardClass}`}>
          <Image
            src="/images/workflow-tech.png"
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 700px"
            className="object-cover opacity-20"
          />
          <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-r from-[#0f0f10] via-[#0f0f10]/88 to-[#0f0f10]/70" : "bg-gradient-to-r from-white via-white/92 to-white/80"}`} />
          <div className="relative z-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${faintText}`}>OPERATION NOTES</p>
                <h3 className={`mt-1 text-lg font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                  {t("今天该看什么", "What to watch today")}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-cyan-300">
                <span className="ui-spinner ui-spinner-sm" aria-hidden="true" />
                <span>{t("状态刷新中", "Status refreshing")}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                {
                  label: t("先处理队列", "Handle queue"),
                  text: activeWork > 0
                    ? t("有任务正在等待 worker，先观察图片任务页。", "Tasks are waiting for workers. Check the jobs page first.")
                    : t("当前队列轻，可以继续上传或生成新素材。", "Queue is light. You can upload or generate more assets."),
                },
                {
                  label: t("再看风险", "Review risk"),
                  text: riskWork > 0
                    ? t("存在待复核/高危结果，建议先处理侵权检测。", "Review or risky results exist. Handle infringement checks first.")
                    : t("风险面板压力低，适合推进套图和导出。", "Risk pressure is low. Move on to mockups and export."),
                },
                {
                  label: t("最后出品", "Ship output"),
                  text: stats.readyDrafts > 0
                    ? t("已有就绪草稿，可以进入商品输出流程。", "Ready drafts are available for product output.")
                    : t("先完成素材处理和套图，再生成商品草稿。", "Finish processing and mockups before drafting products."),
                },
              ].map((item, index) => (
                <div
                  key={item.label}
                  className={`dashboard-note rounded-[10px] border p-4 ${isDark ? "border-white/[0.07] bg-black/20" : "border-black/[0.07] bg-white/70"}`}
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>{item.label}</p>
                  <p className={`mt-2 text-xs leading-relaxed ${mutedText}`}>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
