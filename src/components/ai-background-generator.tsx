"use client";

import { type FormEvent, useState } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

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
  const { mode, accent } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode === "dark";

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${isDark ? "border-white/10 bg-slate-800/50 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500"}`;

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
        body: JSON.stringify({ cutout_url: cutoutUrl.trim(), asset_id: assetId || undefined, scene_description: scene.trim() }),
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
      <div>
        <h4 className={`text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>抠图 + AI 背景合成</h4>
        <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>提供抠图后的透明底图，AI 生成场景背景并自动合成产品图</p>
      </div>

      <form onSubmit={handleGenerate} className="space-y-3">
        {cutoutUrls.length > 0 ? (
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>选择抠图结果</label>
            <select value={cutoutUrl} onChange={(e) => { setCutoutUrl(e.target.value); const m = cutoutUrls.find((c) => c.url === e.target.value); setAssetId(m?.asset_id ?? ""); }} className={inputClass}>
              {cutoutUrls.map((c, i) => (<option key={i} value={c.url}>{c.filename || c.url.slice(-30)}</option>))}
            </select>
          </div>
        ) : (
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>抠图图片 URL</label>
            <input type="url" value={cutoutUrl} onChange={(e) => setCutoutUrl(e.target.value)} placeholder="https://... 透明底 PNG" className={inputClass} required />
          </div>
        )}

        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>场景描述</label>
          <input type="text" value={scene} onChange={(e) => setScene(e.target.value)} placeholder="如: 白色大理石桌面，柔和自然光，极简风格" className={inputClass} required />
        </div>

        <button type="submit" disabled={generating} className={`rounded-lg bg-gradient-to-r ${colors.gradient} px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 transition-all`}>
          {generating ? "生成中..." : "生成背景并合成"}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-3 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>AI 背景</p>
            <img src={result.background_url} alt="background" className="rounded-lg" />
          </div>
          <div className={`rounded-xl border p-3 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>合成结果</p>
            <img src={result.composite_url} alt="composite" className="rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
