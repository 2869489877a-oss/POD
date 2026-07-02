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
  const operationalHealth = Math.max(
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
      label: t("今日新增", "New Assets"),
      note: t("今日上传与采集入库素材", "Uploaded and collected assets today"),
      progress: percent(stats.todayUploads, Math.max(12, stats.todayUploads + 6)),
      tone: "cyan" as Tone,
      value: stats.todayUploads,
    },
    {
      label: t("素材处理率", "Asset Processing"),
      note: t(`已处理 ${assetReadyPercent}%`, `${assetReadyPercent}% processed`),
      progress: assetReadyPercent,
      tone: "emerald" as Tone,
      value: stats.totalAssets,
    },
    {
      label: t("任务队列", "Active Queue"),
      note: statusLabel(activeWork, t("队列空闲", "Queue idle"), t("等待或处理中", "Queued or running")),
      progress: percent(activeWork, Math.max(8, activeWork + finishedWork)),
      tone: activeWork > 0 ? ("amber" as Tone) : ("cyan" as Tone),
      value: activeWork,
    },
    {
      label: t("风险复核", "Risk Review"),
      note: t(`合规通过率 ${riskClearPercent}%`, `${riskClearPercent}% cleared`),
      progress: percent(riskWork, Math.max(1, checkTotal)),
      tone: riskWork > 0 ? ("rose" as Tone) : ("emerald" as Tone),
      value: riskWork,
    },
  ];

  const pipeline = [
    {
      count: stats.todayUploads,
      detail: t("上传、采集与素材入库", "Upload and collection intake"),
      label: t("素材导入", "Asset Intake"),
      progress: percent(stats.todayUploads, Math.max(1, stats.todayUploads + stats.totalAssets)),
      tone: "cyan" as Tone,
    },
    {
      count: stats.pendingChecks + riskWork,
      detail: t("侵权检测、风险分级与人工复核", "Infringement checks and review"),
      label: t("合规审核", "Compliance Review"),
      progress: percent(stats.clearChecks, Math.max(1, checkTotal)),
      tone: riskWork > 0 ? ("amber" as Tone) : ("emerald" as Tone),
    },
    {
      count: activeWork,
      detail: t("抠图、印花提取、尺寸处理与 AI 任务", "Cutout, print, resize, AI"),
      label: t("图片处理", "Image Processing"),
      progress: percent(finishedWork, Math.max(1, finishedWork + activeWork + failedWork)),
      tone: activeWork > 0 ? ("amber" as Tone) : ("cyan" as Tone),
    },
    {
      count: stats.mockupOutputs,
      detail: t("套图模板、商品草稿与导出", "Mockups and product drafts"),
      label: t("商品发布", "Listing Output"),
      progress: draftReadyPercent,
      tone: "emerald" as Tone,
    },
  ];

  const operationRows = [
    {
      label: t("图片处理任务", "Image Processing Jobs"),
      meta: t(`${stats.pendingJobs} 个进行中`, `${stats.pendingJobs} active`),
      value: stats.completedJobs,
      tone: "cyan" as Tone,
    },
    {
      label: t("AI 生成任务", "AI Generation Jobs"),
      meta: t(`${stats.activeAiJobs} 个进行中`, `${stats.activeAiJobs} active`),
      value: stats.completedAiJobs,
      tone: "emerald" as Tone,
    },
    {
      label: t("异常任务", "Failed Tasks"),
      meta: t("需要人工复核", "Needs review"),
      value: failedWork,
      tone: failedWork > 0 ? ("rose" as Tone) : ("cyan" as Tone),
    },
  ];

  const quickLinks = [
    { href: "/upload", label: t("上传素材", "Upload") },
    { href: "/assets", label: t("素材库", "Assets") },
    { href: "/infringement-check", label: t("合规检测", "Risk Check") },
    { href: "/image-jobs", label: t("任务中心", "Jobs") },
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
          className="object-cover object-right opacity-[0.34]"
        />
        <div className="dashboard-grid absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,#07090b_0%,rgba(7,9,11,0.94)_42%,rgba(7,9,11,0.62)_100%)]" />
        <div className="relative z-10 grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="dashboard-chip border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  {t("运营概览", "Operations Dashboard")}
                </span>
                <span className="dashboard-chip border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
                  {t("实时队列", "Live Queue")}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  POD OPERATIONS
                </span>
              </div>
              <h2 className="mt-5 max-w-2xl text-balance text-[32px] font-semibold leading-[1.05] tracking-tight sm:text-[42px] lg:text-[48px]">
                {t("POD 生产运营概览", "POD Production Operations")}
              </h2>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-7 text-zinc-400">
                {t(
                  "集中展示素材入库、合规审核、图片处理和商品发布进度，便于快速判断当前生产状态。",
                  "Track asset intake, compliance review, image processing, and listing output from one operational view.",
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t("综合健康度", "Operational Health"), value: `${operationalHealth}%` },
                { label: t("素材处理率", "Processed Assets"), value: `${assetReadyPercent}%` },
                { label: t("商品就绪率", "Listing Readiness"), value: `${draftReadyPercent}%` },
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
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">OPERATIONS CORE</p>
                <h3 className="mt-1 text-lg font-semibold">{t("运营核心指标", "Operations Core")}</h3>
              </div>
              <span className="ui-activity ui-activity-lg" aria-hidden="true" />
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="dashboard-core mx-auto">
                <div className="dashboard-core-ring" />
                <div className="dashboard-core-inner">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-cyan-100/80">
                    HEALTH
                  </span>
                  <strong>{operationalHealth}</strong>
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
                {t("生产流程", "Production Pipeline")}
              </h3>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-300" : "border-black/[0.08] bg-black/[0.03] text-zinc-600"}`}>
              {t("从素材入库到商品发布", "From asset intake to listing")}
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
              <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${faintText}`}>COMPLIANCE & OUTPUT</p>
              <h3 className={`mt-1 text-lg font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                {t("合规与出品", "Compliance and Output")}
              </h3>
            </div>
            <span className="ui-activity" aria-hidden="true" />
          </div>

          <div className="mt-5 space-y-4">
            <div className={`rounded-[10px] border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.025]" : "border-black/[0.07] bg-black/[0.015]"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-950"}`}>
                    {t("合规检测状态", "Compliance Status")}
                  </p>
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    {t("合规、待检测、复核与高风险分布", "Compliance status distribution")}
                  </p>
                </div>
                <p className={`text-2xl font-semibold tabular-nums ${riskWork > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                  {formatNumber(riskWork)}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-md border border-white/[0.05]">
                {[
                  { label: t("合规", "Clear"), tone: "emerald" as Tone, value: stats.clearChecks },
                  { label: t("待检测", "Pending"), tone: "cyan" as Tone, value: stats.pendingChecks },
                  { label: t("待复核", "Review"), tone: "amber" as Tone, value: stats.reviewChecks },
                  { label: t("高风险", "Risky"), tone: "rose" as Tone, value: stats.riskyChecks + stats.blockedChecks },
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
                    {t("商品发布准备度", "Listing Readiness")}
                  </p>
                  <p className={`mt-1 text-xs ${mutedText}`}>
                    {t("商品草稿、套图和导出进度", "Drafts, mockups, and export progress")}
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
    </div>
  );
}
