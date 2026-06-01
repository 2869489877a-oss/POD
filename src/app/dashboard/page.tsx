import { PageShell } from "@/components/page-shell";
import { fetchDashboardStats } from "@/lib/actions/dashboard";

export const dynamic = "force-dynamic";

const workflowItems = [
  "上传图片",
  "整理素材库",
  "批量图片处理",
  "生成固定商品套图",
  "生成标题、描述、标签",
  "管理商品草稿",
  "导出 Excel 和图片 ZIP",
];

export default async function DashboardPage() {
  const stats = await fetchDashboardStats();

  const summaryCards = [
    { label: "今日上传", value: String(stats.todayUploads), note: "今天新增的素材", color: "from-blue-500 to-blue-600" },
    { label: "素材总数", value: String(stats.totalAssets), note: "素材库中的图片总量", color: "from-emerald-500 to-teal-600" },
    { label: "处理中任务", value: String(stats.pendingJobs), note: "等待或正在处理的任务", color: "from-violet-500 to-purple-600" },
    { label: "商品草稿", value: String(stats.totalDrafts), note: "已创建的商品草稿数", color: "from-amber-500 to-orange-600" },
  ];

  return (
    <PageShell
      title="仪表盘"
      description="POD 商品图批量处理系统概览。"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="relative overflow-hidden rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${card.color}`} />
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-2 text-xs text-slate-400">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">批处理流程</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {workflowItems.map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 transition hover:bg-slate-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold text-white shadow-sm">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">系统说明</h3>
          <div className="mt-5 space-y-3 text-sm leading-6 text-slate-500">
            <p>内部 POD 商品图批量处理系统。</p>
            <p>支持图片上传、批量处理、套图生成、AI 文案和导出功能。</p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
