"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

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

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-providers");
      const data = await res.json();
      const active = (data.providers ?? []).filter((p: { is_active: boolean }) => p.is_active);
      setProviders(active);
      if (active.length > 0 && !selectedProvider) {
        setSelectedProvider(active[0].id);
      }
    } catch { /* ignore */ }
  }, [selectedProvider]);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

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
      if (!res.ok) {
        throw new Error(data.error || "生成失败");
      }
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
          <label className="block text-sm font-medium text-slate-700 mb-1">选择模型</label>
          {providers.length === 0 ? (
            <p className="text-sm text-amber-600">请先在下方「AI 模型配置」中添加模型</p>
          ) : (
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          <label className="block text-sm font-medium text-slate-700 mb-1">提示词 (Prompt)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="描述你想生成的图片..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">反向提示词 (可选)</label>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="不想出现的内容..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">尺寸</label>
            <select
              value={sizeIndex}
              onChange={(e) => setSizeIndex(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {SIZE_PRESETS.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">风格 (可选)</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="如: natural, vivid"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={generating || providers.length === 0}
          className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
        >
          {generating ? "生成中..." : "生成图片"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 min-h-[400px]">
        {generating ? (
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-3 text-sm text-slate-500">AI 正在生成图片...</p>
          </div>
        ) : result?.result_url ? (
          <div className="space-y-3 text-center">
            <img
              src={result.result_url}
              alt="AI generated"
              className="max-h-[360px] rounded-lg shadow-md"
            />
            <p className="text-xs text-slate-500">
              {result.provider} / {result.model} · 已保存到素材库
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">生成结果将显示在这里</p>
        )}
      </div>
    </div>
  );
}
