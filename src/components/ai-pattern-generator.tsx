"use client";

import { type FormEvent, useState } from "react";

export function AiPatternGenerator() {
  const [referenceUrl, setReferenceUrl] = useState("");
  const [styleDescription, setStyleDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ pattern_url?: string; asset_id?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // For generate-and-apply
  const [garmentUrl, setGarmentUrl] = useState("");
  const [applyMode, setApplyMode] = useState(false);
  const [applyResult, setApplyResult] = useState<{ pattern_url?: string; composite_url?: string } | null>(null);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!styleDescription.trim()) return;

    setGenerating(true);
    setError(null);
    setResult(null);
    setApplyResult(null);

    try {
      if (applyMode && garmentUrl.trim()) {
        const res = await fetch("/api/ai/generate-and-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            garment_url: garmentUrl.trim(),
            style_description: styleDescription.trim(),
            opacity: 90,
            blend_mode: "multiply",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setApplyResult(data);
      } else {
        const res = await fetch("/api/ai/generate-pattern", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference_url: referenceUrl.trim() || undefined,
            style_description: styleDescription.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-700">AI 印花生成</h4>
      <p className="text-xs text-slate-500">根据风格描述生成印花图案，可选择直接贴到衣服模板上</p>

      <form onSubmit={handleGenerate} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">风格描述</label>
          <textarea
            value={styleDescription}
            onChange={(e) => setStyleDescription(e.target.value)}
            rows={2}
            placeholder="如: 日式浮世绘风格的海浪图案，蓝白配色"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">参考图 URL (可选，用于风格参考)</label>
          <input
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            placeholder="已提取的印花图片 URL"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="apply-mode"
            checked={applyMode}
            onChange={(e) => setApplyMode(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor="apply-mode" className="text-sm text-slate-700">生成后直接贴到衣服上</label>
        </div>

        {applyMode && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">衣服模板图片 URL</label>
            <input
              type="url"
              value={garmentUrl}
              onChange={(e) => setGarmentUrl(e.target.value)}
              placeholder="衣服模板图片 URL"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              required={applyMode}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={generating}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {generating ? "生成中..." : applyMode ? "生成印花并贴图" : "生成印花图案"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div>
          <p className="text-xs text-slate-500 mb-1">生成的印花图案（已存入素材库）</p>
          <img src={result.pattern_url} alt="pattern" className="max-h-[300px] rounded-lg border" />
        </div>
      )}

      {applyResult && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">生成的印花</p>
            <img src={applyResult.pattern_url} alt="pattern" className="rounded-lg border" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">贴图效果</p>
            <img src={applyResult.composite_url} alt="applied" className="rounded-lg border" />
          </div>
        </div>
      )}
    </div>
  );
}
