"use client";

import { type FormEvent, useState } from "react";

const BG_OPTIONS = [
  { value: "transparent", label: "透明底 PNG" },
  { value: "white", label: "白底" },
  { value: "black", label: "黑底" },
];

export function AiPrintExtractor() {
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [bgMode, setBgMode] = useState("transparent");
  const [tolerance, setTolerance] = useState(80);
  const [refineEdges, setRefineEdges] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<{ final_url?: string; preview_url?: string; raw_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadFileFirst(): Promise<string | null> {
    if (!file) return null;
    const formData = new FormData();
    formData.append("files", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.results?.[0]?.success) {
      throw new Error(data.results?.[0]?.error || "上传失败");
    }
    return data.results[0].asset_id as string;
  }

  async function handleExtract(e: FormEvent) {
    e.preventDefault();
    if (!imageUrl.trim() && !file) return;

    setExtracting(true);
    setError(null);
    setResult(null);

    try {
      let assetId: string | null = null;

      if (file) {
        assetId = await uploadFileFirst();
      }

      if (!assetId && imageUrl.trim()) {
        const importRes = await fetch("/api/import-urls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [imageUrl.trim()] }),
        });
        const importData = await importRes.json();
        assetId = importData.results?.[0]?.asset_id ?? null;
      }

      if (!assetId) throw new Error("无法获取图片素材");

      const outputMode = bgMode === "transparent" ? "transparent" : bgMode === "white" ? "white_preview" : "black_preview";

      const res = await fetch("/api/print-extraction/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_ids: [assetId],
          mode: "auto",
          options: {
            tolerance,
            refineEdges,
            outputMode,
          },
          set_preferred: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提取失败");

      const item = data.results?.[0];
      if (!item || item.status === "failed") {
        throw new Error(item?.error_message || "提取失败");
      }

      setResult({
        final_url: item.final_url,
        preview_url: item.preview_url,
        raw_url: item.raw_url,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "提取失败");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-slate-700">AI 抠印花</h4>
      <p className="text-xs text-slate-500">上传衣服照片，自动识别并提取印花图案，可选择输出底色</p>

      <form onSubmit={handleExtract} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">上传图片</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              if (e.target.files?.[0]) setImageUrl("");
            }}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">或输入图片 URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => { setImageUrl(e.target.value); if (e.target.value) setFile(null); }}
            placeholder="https://..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            disabled={!!file}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">输出底色</label>
            <select
              value={bgMode}
              onChange={(e) => setBgMode(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {BG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">容差 ({tolerance})</label>
            <input
              type="range"
              min={5}
              max={150}
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="refine-edges"
            checked={refineEdges}
            onChange={(e) => setRefineEdges(e.target.checked)}
            className="rounded border-slate-300"
          />
          <label htmlFor="refine-edges" className="text-sm text-slate-700">边缘优化（去噪点、平滑边缘）</label>
        </div>

        <button
          type="submit"
          disabled={extracting || (!imageUrl.trim() && !file)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {extracting ? "提取中..." : "提取印花"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">提取结果</p>
            <img src={result.final_url} alt="extracted" className="rounded-lg border bg-[repeating-conic-gradient(#e2e8f0_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">预览</p>
            <img src={result.preview_url} alt="preview" className="rounded-lg border" />
          </div>
        </div>
      )}
    </div>
  );
}
