"use client";

import { type FormEvent, useState } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { DropZone } from "@/components/drop-zone";

const BG_OPTIONS = [
  { value: "transparent", label: "透明底 PNG" },
  { value: "white", label: "白底" },
  { value: "black", label: "黑底" },
];

export function AiPrintExtractor() {
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState("transparent");
  const [tolerance, setTolerance] = useState(80);
  const [refineEdges, setRefineEdges] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<{ final_url?: string; preview_url?: string; raw_url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mode, accent } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode === "dark";

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${isDark ? "border-white/10 bg-slate-800/50 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500"}`;

  function handleFile(f: File | null) {
    setFile(f);
    setFilePreview(f ? URL.createObjectURL(f) : null);
    if (f) setImageUrl("");
  }

  async function uploadFileFirst(): Promise<string | null> {
    if (!file) return null;
    const formData = new FormData();
    formData.append("files", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.results?.[0]?.success) throw new Error(data.results?.[0]?.error || "上传失败");
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
        body: JSON.stringify({ asset_ids: [assetId], mode: "auto", options: { tolerance, refineEdges, outputMode }, set_preferred: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提取失败");
      const item = data.results?.[0];
      if (!item || item.status === "failed") throw new Error(item?.error_message || "提取失败");
      setResult({ final_url: item.final_url, preview_url: item.preview_url, raw_url: item.raw_url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "提取失败");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className={`text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>AI 抠印花</h4>
        <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>上传衣服照片，自动识别并提取印花图案，可选择输出底色</p>
      </div>

      <form onSubmit={handleExtract} className="space-y-3">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>上传图片</label>
          <DropZone file={file} preview={filePreview} onFileChange={handleFile} label="拖拽衣服图片到此处，或点击选择" hint="支持 jpg、png、webp" />
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>或输入图片 URL</label>
          <input type="url" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); if (e.target.value) { setFile(null); setFilePreview(null); } }} placeholder="https://..." className={inputClass} disabled={!!file} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>输出底色</label>
            <select value={bgMode} onChange={(e) => setBgMode(e.target.value)} className={inputClass}>
              {BG_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
            </select>
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>容差 ({tolerance})</label>
            <input type="range" min={5} max={150} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full mt-2 accent-blue-500" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="refine-edges-dark" checked={refineEdges} onChange={(e) => setRefineEdges(e.target.checked)} className="rounded border-slate-300 text-blue-500 focus:ring-blue-500" />
          <label htmlFor="refine-edges-dark" className={`text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>边缘优化（去噪点、平滑边缘）</label>
        </div>

        <button type="submit" disabled={extracting || (!imageUrl.trim() && !file)} className={`rounded-lg bg-gradient-to-r ${colors.gradient} px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 transition-all`}>
          {extracting ? "提取中..." : "提取印花"}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-3 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>提取结果</p>
            <img src={result.final_url} alt="extracted" className="rounded-lg" />
          </div>
          <div className={`rounded-xl border p-3 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>预览</p>
            <img src={result.preview_url} alt="preview" className="rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
