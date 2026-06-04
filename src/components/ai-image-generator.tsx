"use client";

/* eslint-disable @next/next/no-img-element -- Dynamic AI previews can use arbitrary asset URLs. */

import { type FormEvent, useEffect, useState } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type ProviderOption = {
  id: string;
  display_name: string;
  provider_type: string;
  model_id: string;
};

type GenerateResult = {
  job_id?: string;
  asset_id?: string;
  result_url?: string;
  provider?: string;
  model?: string;
  error?: string;
};

type GenerationStatus = "idle" | "submitting" | "generating" | "success" | "failed";
type GenerationStage = "submitting" | "generating";

const SIZE_PRESETS = [
  { label: "1:1 (1024x1024)", width: 1024, height: 1024 },
  { label: "16:9 (1792x1024)", width: 1792, height: 1024 },
  { label: "9:16 (1024x1792)", width: 1024, height: 1792 },
  { label: "4:3 (1024x768)", width: 1024, height: 768 },
];

export function AiImageGenerator() {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sizeIndex, setSizeIndex] = useState(0);
  const [style, setStyle] = useState("");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [failedStage, setFailedStage] = useState<GenerationStage | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const generating = generationStatus === "submitting" || generationStatus === "generating";
  const statusLabel =
    generationStatus === "submitting"
      ? t("提交中", "Submitting")
      : generationStatus === "generating"
        ? t("生成中", "Generating")
        : generationStatus === "success"
          ? t("生成成功", "Completed")
          : generationStatus === "failed"
            ? t("生成失败", "Failed")
            : t("等待开始", "Ready");
  const statusDescription =
    generationStatus === "submitting"
      ? t("正在提交提示词和模型参数。", "Submitting the prompt and model parameters.")
      : generationStatus === "generating"
        ? t("请求已提交，AI 正在生成图片。", "Request submitted. AI is generating the image.")
        : generationStatus === "success"
          ? t("图片生成完成，并已保存到素材库。", "The image was generated and saved to Assets.")
          : generationStatus === "failed"
            ? t("任务未完成，请查看错误信息后重试。", "The task did not complete. Review the error and retry.")
            : t("填写提示词并点击生成后，状态会显示在这里。", "Enter a prompt and start generation to see progress here.");
  const statusTone =
    generationStatus === "success"
      ? "bg-emerald-500/10 text-emerald-400"
      : generationStatus === "failed"
        ? "bg-red-500/10 text-red-400"
        : generating
          ? "bg-amber-500/10 text-amber-400"
          : isDark
            ? "bg-white/[0.06] text-slate-400"
            : "bg-slate-100 text-slate-600";
  const statusSteps: Array<{ id: "submitting" | "generating" | "success"; label: string }> = [
    { id: "submitting", label: t("提交", "Submit") },
    { id: "generating", label: t("生成", "Generate") },
    { id: "success", label: t("成功", "Success") },
  ];
  const activeStepIndex =
    generationStatus === "submitting"
      ? 0
      : generationStatus === "generating"
        ? 1
        : generationStatus === "success"
          ? 2
          : generationStatus === "failed"
            ? failedStage === "generating" ? 1 : 0
            : -1;
  const completedStepIndex =
    generationStatus === "success"
      ? 2
      : generationStatus === "generating" || (generationStatus === "failed" && failedStage === "generating")
        ? 0
        : -1;

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${isDark ? "border-white/10 bg-slate-800/50 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500"}`;

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (cancelled) return;
        const active = (data.providers ?? []).filter((p: { is_active: boolean }) => p.is_active);
        setProviders(active);
        setSelectedProvider((c) => c || active[0]?.id || "");
      } catch { /* ignore */ }
    }
    void loadProviders();
    return () => { cancelled = true; };
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setGenerationStatus("submitting");
    setFailedStage(null);
    setError(null);
    setResult(null);
    const size = SIZE_PRESETS[sizeIndex];
    let activeStage: GenerationStage = "submitting";
    try {
      activeStage = "generating";
      setGenerationStatus("generating");
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          width: size.width,
          height: size.height,
          style: style.trim() || undefined,
          provider_id: selectedProvider || undefined,
          save_to_assets: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("生成失败", "Generation failed"));
      setResult(data);
      setGenerationStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("生成失败", "Generation failed"));
      setFailedStage(activeStage);
      setGenerationStatus("failed");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div
          aria-live="polite"
          className={`rounded-2xl border p-3.5 ${isDark ? "border-white/[0.08] bg-slate-950/20" : "border-black/[0.05] bg-slate-50/80"}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold uppercase ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                {t("任务状态", "Task Status")}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>{statusDescription}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>
              {statusLabel}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {statusSteps.map((step, index) => {
              const active = index === activeStepIndex;
              const completed = index <= completedStepIndex;
              const failed = generationStatus === "failed" && active;
              return (
                <div
                  key={step.id}
                  className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                    failed
                      ? isDark ? "border-red-400/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-700"
                      : active
                        ? isDark ? "border-amber-400/30 bg-amber-500/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"
                        : completed
                          ? isDark ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : isDark ? "border-white/[0.06] text-slate-500" : "border-black/[0.05] text-slate-400"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      failed
                        ? "bg-red-500 text-white"
                        : completed
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "bg-amber-500 text-white"
                            : isDark ? "bg-white/[0.06] text-slate-500" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {completed ? "✓" : index + 1}
                  </span>
                  <span className="truncate text-xs font-semibold">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("选择模型", "Model")}</label>
          {providers.length === 0 ? (
            <p className="text-sm text-amber-500">{t("请先在「设置」页面添加 AI 模型", "Add an AI model in Settings first")}</p>
          ) : (
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className={inputClass}>
              {providers.map((p) => (<option key={p.id} value={p.id}>{p.display_name}</option>))}
            </select>
          )}
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("提示词 (Prompt)", "Prompt")}</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder={t("描述你想生成的图片...", "Describe the image you want to generate...")} className={inputClass} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("尺寸", "Size")}</label>
            <select value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))} className={inputClass}>
              {SIZE_PRESETS.map((s, i) => (<option key={i} value={i}>{s.label}</option>))}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("风格 (可选)", "Style (optional)")}</label>
            <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder={t("如: natural, vivid", "e.g. natural, vivid")} className={inputClass} />
          </div>
        </div>
        <button type="submit" disabled={generating || providers.length === 0} className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all`}>
          {generationStatus === "submitting"
            ? t("提交中...", "Submitting...")
            : generationStatus === "generating"
              ? t("生成中...", "Generating...")
              : generationStatus === "failed"
                ? t("重新生成", "Retry Generation")
                : t("生成图片", "Generate Image")}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
      <div className={`flex items-center justify-center rounded-xl border p-4 min-h-[400px] ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
        {generating ? (
          <div className="text-center">
            <div className={`mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${isDark ? "border-blue-400" : "border-blue-500"}`} />
            <p className={`mt-4 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{statusDescription}</p>
          </div>
        ) : result?.result_url ? (
          <div className="space-y-3 text-center">
            <img src={result.result_url} alt="AI generated" className="max-h-[360px] rounded-lg shadow-lg" />
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{result.provider} / {result.model} · {t("已保存到素材库", "Saved to Assets")}</p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center ${isDark ? "bg-slate-700/50" : "bg-slate-200/80"}`}>
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("生成结果将显示在这里", "Generated results will appear here")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
