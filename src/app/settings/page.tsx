import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <PageShell title="设置" description="管理 AI 模型配置、系统参数等。">
      <div className="space-y-8">
        <AiProvidersManager />
        <div className="border-t border-slate-200 pt-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">系统信息</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">版本</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">v0.1.0</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">运行环境</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">Next.js + Supabase</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">支持的 AI 平台</p>
              <p className="mt-1 text-sm text-slate-700">Gemini · OpenAI · 豆包 · 通义万相</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">图片处理</p>
              <p className="mt-1 text-sm text-slate-700">Sharp · 抠图 · 印花提取 · 套图</p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
