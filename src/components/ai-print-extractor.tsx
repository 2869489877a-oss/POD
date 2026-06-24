"use client";

/* eslint-disable @next/next/no-img-element -- Dynamic local previews can use blob/data URLs. */

import { type FormEvent, useState } from "react";
import { DropZone } from "@/components/drop-zone";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { applyTransparentBackgroundToRgba } from "@/lib/image-processing/transparent-background-core";

export function AiPrintExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [transparency, setTransparency] = useState(100);
  const [tolerance, setTolerance] = useState(42);
  const [feather, setFeather] = useState(18);
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  function handleFile(f: File | null) {
    setFile(f);
    setFilePreview(f ? URL.createObjectURL(f) : null);
    setResultUrl(null);
    setError(null);
  }

  async function processFile(input: File) {
    const bitmap = await createImageBitmap(input);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t("无法创建图片处理画布", "Unable to create image processing canvas"));

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyTransparentBackgroundToRgba(imageData.data, canvas.width, canvas.height, {
      feather,
      tolerance,
      transparency,
    });
    ctx.putImageData(imageData, 0, 0);
    bitmap.close();

    return canvas.toDataURL("image/png");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setProcessing(true);
    setError(null);
    setResultUrl(null);

    try {
      setResultUrl(await processFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("换底失败", "Background replacement failed"));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h4 className={`text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{t("印花图换底", "Transparent Print Background")}</h4>
          <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("本地处理白底或浅色底印花图，输出透明底 PNG。", "Process white or light-background print images locally and output a transparent PNG.")}</p>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("上传印花图", "Upload Print Image")}</label>
          <DropZone file={file} preview={filePreview} onFileChange={handleFile} label={t("拖拽印花图到此处，或点击选择", "Drag a print image here, or click to choose")} hint={t("支持 jpg、png、webp", "Supports jpg, png, and webp")} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("透明强度", "Transparency")} ({transparency}%)</label>
            <input type="range" min={0} max={100} value={transparency} onChange={(e) => setTransparency(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("底色容差", "Background Tolerance")} ({tolerance})</label>
            <input type="range" min={8} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("边缘过渡", "Edge Feather")} ({feather})</label>
            <input type="range" min={0} max={60} value={feather} onChange={(e) => setFeather(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
        </div>

        <button type="submit" disabled={processing || !file} className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all`}>
          {processing ? t("处理中...", "Processing...") : t("生成透明底", "Generate Transparent PNG")}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>

      <div
        className={`ui-result-stage flex min-h-[400px] items-center justify-center rounded-xl border p-4 ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}
        data-live={processing ? "true" : "false"}
      >
        {processing ? (
          <div className="relative z-10 text-center">
            <span className="ui-spinner ui-spinner-lg mx-auto text-cyan-400" aria-hidden="true" />
            <p className={`mt-4 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("正在本地换底...", "Replacing background locally...")}</p>
          </div>
        ) : resultUrl ? (
          <div className="relative z-10 space-y-3 text-center">
            <div
              className="rounded-lg p-4 shadow-lg"
              style={{
                backgroundColor: "#fff",
                backgroundImage:
                  "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                backgroundSize: "16px 16px",
              }}
            >
              <img src={resultUrl} alt="transparent print" className="mx-auto max-h-[360px] rounded-lg" />
            </div>
            <a href={resultUrl} download="transparent-print.png" className={`inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r ${colors.gradient}`}>
              {t("下载 PNG", "Download PNG")}
            </a>
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center ${isDark ? "bg-slate-700/50" : "bg-slate-200/80"}`}>
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("透明底结果将显示在这里", "Transparent result will appear here")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
