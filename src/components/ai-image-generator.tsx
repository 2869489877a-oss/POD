"use client";

import { type FormEvent, useEffect, useState } from "react";

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
  image_base64?: string;
  mime_type?: string;
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

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (cancelled) return;
        const active = (data.providers ?? []).filter((p: { is_active: boolean }) => p.is_active);
        setProviders(active);
        setSelectedProvider((current) => current || active[0]?.id || "");
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
          <label className="block text-sm font-medium text-slate-300 mb-1.5">选择模型</label>
          {providers.length === 0 ? (
            <p className="text-sm text-amber-400">请先在「设置」页面添加 AI 模型</p>
          ) : (
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full rounded-lg border border-violet-500/20 bg-[#1a1a3e] px-3 py-2.5 text-sm text-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} ({p.provider_type} / {p.model_id})
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">提示词 (Prompt)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="描述你想生成的图片..."
            className="w-full rounded-lg border border-violet-500/20 bg-[#1a1a3e] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">反向提示词 (可选)</label>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="不想出现的内容..."
            className="w-full rounded-lg border border-violet-500/20 bg-[#1a1a3e] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">尺寸</label>
            <select
              value={sizeIndex}
              onChange={(e) => setSizeIndex(Number(e.target.value))}
              className="w-full rounded-lg border border-violet-500/20 bg-[#1a1a3e] px-3 py-2.5 text-sm text-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {SIZE_PRESETS.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">风格 (可选)</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="如: natural, vivid"
              className="w-full rounded-lg border border-violet-500/20 bg-[#1a1a3e] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={generating || providers.length === 0}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all"
        >
          {generating ? "生成中..." : "生成图片"}
        </button>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      <div className="flex items-center justify-center rounded-xl border border-violet-500/10 bg-[#0d0d24] p-4 min-h-[400px]">
        {generating ? (
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            <p className="mt-4 text-sm text-slate-400">AI 正在生成图片...</p>
          </div>
        ) : result?.result_url ? (
          <div className="space-y-3 text-center">
            <img
              src={result.result_url}
              alt="AI generated"
              className="max-h-[360px] rounded-lg shadow-xl shadow-violet-500/10"
            />
            <p className="text-xs text-slate-500">
              {result.provider} / {result.model} · 已保存到素材库
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center">
              <svg className="h-6 w-6 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500">生成结果将显示在这里</p>
          </div>
        )}
      </div>
    </div>
  );
}
