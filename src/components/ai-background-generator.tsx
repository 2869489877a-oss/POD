"use client";

import { type FormEvent, useState } from "react";

type Props = {
  cutoutUrls?: Array<{ url: string; asset_id: string; filename?: string }>;
};

export function AiBackgroundGenerator({ cutoutUrls = [] }: Props) {
  const [cutoutUrl, setCutoutUrl] = useState(cutoutUrls[0]?.url ?? "");
  const [assetId, setAssetId] = useState(cutoutUrls[0]?.asset_id ?? "");
  const [scene, setScene] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ background_url?: string; composite_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!cutoutUrl.trim() || !scene.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cutout_url: cutoutUrl.trim(),
          asset_id: assetId || undefined,
          scene_description: scene.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-700">抠图 + AI 背景合成</h4>
      <p className="text-xs text-slate-500">提供抠图后的透明底图 URL，AI 生成场景背景并自动合成</p>

      <form onSubmit={handleGenerate} className="space-y-3">
        {cutoutUrls.length > 0 ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">选择抠图结果</label>
            <select
              value={cutoutUrl}
              onChange={(e) => {
                setCutoutUrl(e.target.value);
                const match = cutoutUrls.find((c) => c.url === e.target.value);
                setAssetId(match?.asset_id ?? "");
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {cutoutUrls.map((c, i) => (
                <option key={i} value={c.url}>{c.filename || c.url.slice(-30)}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">抠图图片 URL</label>
            <input
              type="url"
              value={cutoutUrl}
              onChange={(e) => setCutoutUrl(e.target.value)}
              placeholder="https://... 透明底 PNG"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">场景描述</label>
          <input
            type="text"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            placeholder="如: 白色大理石桌面，柔和自然光，极简风格"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={generating}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {generating ? "生成中..." : "生成背景并合成"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">AI 背景</p>
            <img src={result.background_url} alt="background" className="rounded-lg border" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">合成结果</p>
            <img src={result.composite_url} alt="composite" className="rounded-lg border" />
          </div>
        </div>
      )}
    </div>
  );
}
