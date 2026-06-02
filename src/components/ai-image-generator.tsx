"use client";

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
  const [negativePrompt, setNegativePrompt] = useState("");
  const [sizeIndex, setSizeIndex] = useState(0);
  const [style, setStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mode, accent } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode === "dark";

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
    setGenerating(true);
    setError(null);
    setResult(null);
    const size = SIZE_PRESETS[sizeIndex];
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negative_prompt: negativePrompt.trim() || undefined,
          width: size.width,
          height: size.height,
          style: style.trim() || undefined,
          provider_id: selectedProvider || undefined,
          save_to_assets: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>选择模型</label>
          {providers.length === 0 ? (
            <p className="text-sm text-amber-500">请先在「设置」页面添加 AI 模型</p>
          ) : (
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className={inputClass}>
              {providers.map((p) => (<option key={p.id} value={p.id}>{p.display_name}</option>))}
            </select>
          )}
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>提示词 (Prompt)</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="描述你想生成的图片..." className={inputClass} required />
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>反向提示词 (可选)</label>
          <input type="text" value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="不想出现的内容..." className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>尺寸</label>
            <select value={sizeIndex} onChange={(e) => setSizeIndex(Number(e.target.value))} className={inputClass}>
              {SIZE_PRESETS.map((s, i) => (<option key={i} value={i}>{s.label}</option>))}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>风格 (可选)</label>
            <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="如: natural, vivid" className={inputClass} />
          </div>
        </div>
        <button type="submit" disabled={generating || providers.length === 0} className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all`}>
          {generating ? "生成中..." : "生成图片"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
      <div className={`flex items-center justify-center rounded-xl border p-4 min-h-[400px] ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
        {generating ? (
          <div className="text-center">
            <div className={`mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${isDark ? "border-blue-400" : "border-blue-500"}`} />
            <p className={`mt-4 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>AI 正在生成图片...</p>
          </div>
        ) : result?.result_url ? (
          <div className="space-y-3 text-center">
            <img src={result.result_url} alt="AI generated" className="max-h-[360px] rounded-lg shadow-lg" />
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{result.provider} / {result.model} · 已保存到素材库</p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center ${isDark ? "bg-slate-700/50" : "bg-slate-200/80"}`}>
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>生成结果将显示在这里</p>
          </div>
        )}
      </div>
    </div>
  );
}
