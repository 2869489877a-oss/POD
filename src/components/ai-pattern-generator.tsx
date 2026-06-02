"use client";

import { type FormEvent, useState } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { DropZone } from "@/components/drop-zone";
import { getUploadedImageUrl, type UploadApiResult } from "@/lib/upload-result";

export function AiPatternGenerator() {
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [styleDescription, setStyleDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ pattern_url?: string; asset_id?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [garmentUrl, setGarmentUrl] = useState("");
  const [garmentFile, setGarmentFile] = useState<File | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [applyMode, setApplyMode] = useState(false);
  const [applyResult, setApplyResult] = useState<{ pattern_url?: string; composite_url?: string } | null>(null);
  const { mode, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode !== "light";

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${isDark ? "border-white/10 bg-slate-800/50 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500"}`;

  function handleRefFile(f: File | null) {
    setReferenceFile(f);
    setReferencePreview(f ? URL.createObjectURL(f) : null);
    if (f) setReferenceUrl("");
  }

  function handleGarmentFile(f: File | null) {
    setGarmentFile(f);
    setGarmentPreview(f ? URL.createObjectURL(f) : null);
    if (f) setGarmentUrl("");
  }

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("files", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.results?.[0]?.success) throw new Error(t("上传失败", "Upload failed"));
    const uploadedUrl = getUploadedImageUrl(data.results[0] as UploadApiResult);
    if (!uploadedUrl) throw new Error(t("上传成功，但缺少可访问的图片 URL", "Upload succeeded, but no accessible image URL was returned"));
    return uploadedUrl;
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!styleDescription.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setApplyResult(null);

    try {
      const finalRefUrl = referenceFile ? await uploadFile(referenceFile) : referenceUrl.trim() || undefined;

      if (applyMode && (garmentUrl.trim() || garmentFile)) {
        const finalGarmentUrl = garmentFile ? await uploadFile(garmentFile) : garmentUrl.trim();
        const res = await fetch("/api/ai/generate-and-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ garment_url: finalGarmentUrl, style_description: styleDescription.trim(), reference_url: finalRefUrl, opacity: 90, blend_mode: "multiply" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setApplyResult(data);
      } else {
        const res = await fetch("/api/ai/generate-pattern", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference_url: finalRefUrl, style_description: styleDescription.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("生成失败", "Generation failed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className={`text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{t("AI 生成印花", "AI Pattern Generator")}</h4>
        <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("根据风格描述生成印花图案，可选择直接贴到衣服模板上", "Generate print patterns from a style description, with optional direct placement on a garment template.")}</p>
      </div>

      <form onSubmit={handleGenerate} className="space-y-3">
        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("风格描述", "Style Description")}</label>
          <textarea value={styleDescription} onChange={(e) => setStyleDescription(e.target.value)} rows={2} placeholder={t("如: 日式浮世绘风格的海浪图案，蓝白配色", "e.g. Ukiyo-e style wave pattern, blue and white palette")} className={inputClass} required />
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("上传参考图 (可选)", "Upload Reference Image (optional)")}</label>
          <DropZone file={referenceFile} preview={referencePreview} onFileChange={handleRefFile} label={t("拖拽参考图到此处，或点击选择", "Drag a reference image here, or click to choose")} hint={t("支持 jpg、png、webp", "Supports jpg, png, and webp")} />
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("或输入参考图 URL (可选)", "Or Enter Reference Image URL (optional)")}</label>
          <input type="url" value={referenceUrl} onChange={(e) => { setReferenceUrl(e.target.value); if (e.target.value) { setReferenceFile(null); setReferencePreview(null); } }} placeholder={t("已提取的印花图片 URL", "Extracted print image URL")} className={inputClass} disabled={!!referenceFile} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="apply-mode" checked={applyMode} onChange={(e) => setApplyMode(e.target.checked)} className="rounded border-slate-300 text-blue-500 focus:ring-blue-500" />
          <label htmlFor="apply-mode" className={`text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}>{t("生成后直接贴到衣服上", "Apply to garment after generation")}</label>
        </div>

        {applyMode && (
          <>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("上传衣服模板图片", "Upload Garment Template")}</label>
              <DropZone file={garmentFile} preview={garmentPreview} onFileChange={handleGarmentFile} label={t("拖拽衣服模板到此处，或点击选择", "Drag a garment template here, or click to choose")} hint={t("支持 jpg、png、webp", "Supports jpg, png, and webp")} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("或输入衣服模板 URL", "Or Enter Garment Template URL")}</label>
              <input type="url" value={garmentUrl} onChange={(e) => { setGarmentUrl(e.target.value); if (e.target.value) { setGarmentFile(null); setGarmentPreview(null); } }} placeholder={t("衣服模板图片 URL", "Garment template image URL")} className={inputClass} disabled={!!garmentFile} />
            </div>
          </>
        )}

        <button type="submit" disabled={generating} className={`rounded-lg bg-gradient-to-r ${colors.gradient} px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 transition-all`}>
          {generating ? t("生成中...", "Generating...") : applyMode ? t("生成印花并贴图", "Generate Pattern and Apply") : t("生成印花图案", "Generate Pattern")}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className={`rounded-xl border p-4 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
          <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("生成的印花图案（已存入素材库）", "Generated pattern (saved to Assets)")}</p>
          <img src={result.pattern_url} alt="pattern" className="max-h-[300px] rounded-lg" />
        </div>
      )}

      {applyResult && (
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-3 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("生成的印花", "Generated Pattern")}</p>
            <img src={applyResult.pattern_url} alt="pattern" className="rounded-lg" />
          </div>
          <div className={`rounded-xl border p-3 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
            <p className={`text-xs mb-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("贴图效果", "Applied Preview")}</p>
            <img src={applyResult.composite_url} alt="applied" className="rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
