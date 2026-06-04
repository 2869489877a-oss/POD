"use client";

/* eslint-disable @next/next/no-img-element -- Dynamic AI previews can use arbitrary asset URLs. */

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { DropZone } from "@/components/drop-zone";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { getUploadedImageUrl, type UploadApiResult } from "@/lib/upload-result";

type ProviderOption = {
  id: string;
  display_name: string;
};

type GenerateResult = {
  result_url?: string;
  provider?: string;
  model?: string;
};

const PRINT_AVOID_TERMS = [
  "衣服",
  "模特",
  "人物",
  "身体",
  "背景",
  "墙面",
  "地面",
  "布料纹理",
  "褶皱",
  "阴影",
  "口袋",
  "帽绳",
  "袖子",
  "衣领",
  "裤子",
  "手",
  "低清晰度",
  "模糊",
  "噪点",
  "图案残缺",
  "文字错误",
  "乱码文字",
  "变形文字",
  "多余文字",
  "水印",
  "logo",
  "边框",
  "裁切",
  "重复图案",
  "拍摄光影",
  "商品照片背景",
  "衣架",
  "标签",
  "拉链",
  "纽扣",
  "头发",
  "皮肤",
].join("，");

const PRINT_AVOID_TERMS_EN = [
  "clothing",
  "model",
  "person",
  "body",
  "background",
  "wall",
  "floor",
  "fabric texture",
  "wrinkles",
  "shadows",
  "pockets",
  "drawstrings",
  "sleeves",
  "collar",
  "pants",
  "hands",
  "low resolution",
  "blur",
  "noise",
  "incomplete artwork",
  "wrong text",
  "garbled text",
  "distorted text",
  "extra text",
  "watermark",
  "logo",
  "border",
  "cropping",
  "repeated pattern",
  "photo lighting",
  "product photo background",
  "hanger",
  "label",
  "zipper",
  "buttons",
  "hair",
  "skin",
].join(", ");

const PRINT_PROMPT_TEMPLATES = [
  {
    nameZh: "精准提取印花",
    nameEn: "Precise Print Extraction",
    promptZh: `请参考上传的服装图片，仅提取衣服上的印花图案，并重新整理为干净、完整、高清的独立印花素材。保留原图中的主要图案元素、文字内容、颜色搭配、整体构图和风格，不要改变主题。输出为居中排版、白色或透明背景、边缘清晰、细节完整、适合POD服装印刷的图案素材。不要包含：${PRINT_AVOID_TERMS}。`,
    promptEn: `Use the uploaded garment photo as reference. Extract only the print artwork from the clothing and rebuild it as a clean, complete, high-resolution standalone print asset. Preserve the main artwork elements, text content, color relationships, overall composition, and style without changing the theme. Output centered artwork on a white or transparent background with clean edges and complete details, suitable for POD garment printing. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
  },
  {
    nameZh: "高清还原印花",
    nameEn: "HD Print Restoration",
    promptZh: `请从上传的服装照片中识别并还原衣服表面的印花设计，只保留印花本身。按原印花的图案、文字、色彩、层次和构图重新绘制为高清印刷素材，线条干净，边缘锐利，色块清晰，文字尽量保持正确。不要生成服装、人物、背景或摄影痕迹。不要包含：${PRINT_AVOID_TERMS}。`,
    promptEn: `Identify and restore the print design from the uploaded garment photo. Keep only the print itself. Recreate the original artwork, text, colors, layers, and composition as a high-resolution print asset with clean lines, sharp edges, clear color blocks, and text kept as accurate as possible. Do not generate clothing, people, background, or photographic traces. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
  },
  {
    nameZh: "矢量风印花",
    nameEn: "Vector Style Print",
    promptZh: `请参考上传图片里的服装印花，生成适合服装印刷的独立矢量风图案素材。保持原始印花主题、主视觉、文字位置、颜色关系和整体风格，增强线条清晰度与图案完整度，输出居中、干净、无多余背景的POD印花图。不要包含：${PRINT_AVOID_TERMS}。`,
    promptEn: `Reference the garment print in the uploaded image and generate a standalone vector-style artwork asset suitable for garment printing. Preserve the original theme, main visual, text placement, color relationships, and overall style. Improve line clarity and artwork completeness. Output a centered, clean POD print with no extra background. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
  },
  {
    nameZh: "文字图案修复",
    nameEn: "Text and Artwork Repair",
    promptZh: `请提取上传服装图片中的印花图案，并重点修复印花内的文字、边缘和图案缺失部分。尽量保留原印花文字内容和排版，不新增无关文字，不改变主题风格。输出干净完整、高清、居中、可直接用于服装印刷的独立图案素材。不要包含：${PRINT_AVOID_TERMS}。`,
    promptEn: `Extract the print artwork from the uploaded garment image, focusing on repairing text, edges, and missing artwork areas. Preserve the original text content and layout as much as possible. Do not add unrelated text or change the theme/style. Output a clean, complete, high-resolution, centered standalone artwork asset ready for garment printing. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
  },
  {
    nameZh: "黑白线稿印花",
    nameEn: "Black and White Line Art",
    promptZh: `请参考上传的服装图片，仅提取衣服上的印花主体，并整理为黑白高对比线稿风格的独立印花素材。保留原图案主题、构图和文字位置，强化轮廓、线条和边缘清晰度，输出居中、干净、适合POD服装印刷的图案。不要包含：${PRINT_AVOID_TERMS}。`,
    promptEn: `Reference the uploaded garment image and extract only the main print artwork from the clothing. Convert it into a standalone black-and-white high-contrast line-art print asset. Preserve the original theme, composition, and text placement. Strengthen outlines, lines, and edge clarity. Output centered, clean artwork suitable for POD garment printing. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
  },
];

const BACKGROUND_COLOR_OPTIONS = [
  { id: "transparent", zh: "透明", en: "Transparent", promptZh: "换成透明底。", promptEn: "Change the background to transparent.", swatch: "transparent" },
  { id: "white", zh: "白色", en: "White", promptZh: "换成白色底。", promptEn: "Change the background to white.", swatch: "#ffffff" },
  { id: "black", zh: "黑色", en: "Black", promptZh: "换成黑色底。", promptEn: "Change the background to black.", swatch: "#111827" },
  { id: "gray", zh: "灰色", en: "Gray", promptZh: "换成灰色底。", promptEn: "Change the background to gray.", swatch: "#9ca3af" },
  { id: "red", zh: "红色", en: "Red", promptZh: "换成红色底。", promptEn: "Change the background to red.", swatch: "#ef4444" },
  { id: "orange", zh: "橙色", en: "Orange", promptZh: "换成橙色底。", promptEn: "Change the background to orange.", swatch: "#f97316" },
  { id: "yellow", zh: "黄色", en: "Yellow", promptZh: "换成黄色底。", promptEn: "Change the background to yellow.", swatch: "#facc15" },
  { id: "green", zh: "绿色", en: "Green", promptZh: "换成绿色底。", promptEn: "Change the background to green.", swatch: "#22c55e" },
  { id: "cyan", zh: "青色", en: "Cyan", promptZh: "换成青色底。", promptEn: "Change the background to cyan.", swatch: "#06b6d4" },
  { id: "blue", zh: "蓝色", en: "Blue", promptZh: "换成蓝色底。", promptEn: "Change the background to blue.", swatch: "#3b82f6" },
  { id: "purple", zh: "紫色", en: "Purple", promptZh: "换成紫色底。", promptEn: "Change the background to purple.", swatch: "#8b5cf6" },
  { id: "pink", zh: "粉色", en: "Pink", promptZh: "换成粉色底。", promptEn: "Change the background to pink.", swatch: "#ec4899" },
  { id: "beige", zh: "米色", en: "Beige", promptZh: "换成米色底。", promptEn: "Change the background to beige.", swatch: "#e8d8bd" },
  { id: "brown", zh: "棕色", en: "Brown", promptZh: "换成棕色底。", promptEn: "Change the background to brown.", swatch: "#8b5e34" },
] as const;

export function AiBackgroundGenerator() {
  const { isDark, accent, language, t } = useSettings();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [selectedBackgroundColor, setSelectedBackgroundColor] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colors = ACCENT_COLORS[accent];
  const currentTemplatePrompt =
    language === "zh"
      ? PRINT_PROMPT_TEMPLATES[templateIndex]?.promptZh ?? ""
      : PRINT_PROMPT_TEMPLATES[templateIndex]?.promptEn ?? "";
  const prompt = customPrompt ?? currentTemplatePrompt;

  const inputClass = `w-full rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-1 ${isDark ? "border-white/[0.08] bg-white/[0.05] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-cyan-400/40" : "border-black/[0.06] bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-cyan-500/30"}`;

  function handleFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (cancelled) return;
        const active = (data.providers ?? []).filter((p: { is_active: boolean }) => p.is_active);
        setProviders(active);
        setSelectedProvider((c) => c || active[0]?.id || "");
      } catch {
        /* ignore */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!file || !prompt.trim()) return;
    const backgroundPrompt = BACKGROUND_COLOR_OPTIONS.find((option) => option.id === selectedBackgroundColor);
    const finalPrompt = [prompt.trim(), backgroundPrompt ? (language === "zh" ? backgroundPrompt.promptZh : backgroundPrompt.promptEn) : ""]
      .filter(Boolean)
      .join(" ");
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadData.results?.[0]?.success) throw new Error(t("图片上传失败", "Image upload failed"));
      const imageUrl = getUploadedImageUrl(uploadData.results[0] as UploadApiResult);
      if (!imageUrl) throw new Error(t("图片上传成功，但缺少可访问的图片 URL", "Image uploaded, but no accessible image URL was returned"));

      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          reference_url: imageUrl,
          provider_id: selectedProvider || undefined,
          save_to_assets: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("生成失败", "Generation failed"));
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("生成失败", "Generation failed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(500px,0.92fr)_minmax(500px,1fr)]">
      <form onSubmit={handleGenerate} className={`space-y-4 rounded-[20px] border p-5 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.05] bg-white/60"}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.05] bg-white/70"}`}>
          <div>
            <p className={`text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>
              {t("单图提取模式", "Single Image Mode")}
            </p>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              {t("需要多张图对应多张印花时，进入批量队列页面。", "Use the batch queue when multiple images need matching outputs.")}
            </p>
          </div>
          <Link
            href="/ai-image/batch"
            className={`rounded-xl bg-gradient-to-r ${colors.gradient} px-4 py-2 text-sm font-semibold text-white shadow-lg ${colors.shadow} transition hover:brightness-110`}
          >
            {t("打开批量生图页面", "Open Batch Page")}
          </Link>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("选择模型", "Model")}</label>
          {providers.length === 0 ? (
            <p className="text-sm text-amber-500">{t("请先在“设置”页面添加 AI 模型", "Add an AI model in Settings first")}</p>
          ) : (
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className={inputClass}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("上传原图", "Upload Source Image")}</label>
          <DropZone file={file} preview={preview} onFileChange={handleFile} label={t("拖拽图片到此处，或点击选择", "Drag an image here, or click to choose")} hint={t("支持 jpg、png、webp", "Supports jpg, png, and webp")} />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("常用模板", "Prompt Templates")}</label>
          <select
            value={templateIndex}
            onChange={(e) => {
              const nextIndex = Number(e.target.value);
              setTemplateIndex(nextIndex);
              setCustomPrompt(null);
            }}
            className={inputClass}
          >
            {PRINT_PROMPT_TEMPLATES.map((template, index) => (
              <option key={template.nameZh} value={index}>{t(template.nameZh, template.nameEn)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("提示词 (Prompt)", "Prompt")}</label>
          <textarea value={prompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={8} placeholder={t("请填写印花提取提示词...", "Enter a print extraction prompt...")} className={inputClass} required />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>{t("底色", "Background Color")}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BACKGROUND_COLOR_OPTIONS.map((option) => {
              const selected = selectedBackgroundColor === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedBackgroundColor((current) => current === option.id ? null : option.id)}
                  className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
                    selected
                      ? `border-transparent bg-gradient-to-r ${colors.gradient} text-white`
                      : isDark
                        ? "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:border-white/[0.14]"
                        : "border-black/[0.06] bg-white text-slate-700 hover:border-black/[0.12]"
                  }`}
                  aria-pressed={selected}
                >
                  <span
                    className={`relative h-5 w-5 shrink-0 overflow-hidden rounded-full border ${option.id === "white" ? "border-slate-300" : "border-transparent"}`}
                    style={{
                      background:
                        option.id === "transparent"
                          ? "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)"
                          : option.swatch,
                      backgroundPosition: option.id === "transparent" ? "0 0, 0 5px, 5px -5px, -5px 0" : undefined,
                      backgroundSize: option.id === "transparent" ? "10px 10px" : undefined,
                    }}
                  >
                    {selected && (
                      <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold bg-white/90 text-slate-950`}>
                        ✓
                      </span>
                    )}
                  </span>
                  <span>{t(option.zh, option.en)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={generating || !file || providers.length === 0}
          className={
            `w-full rounded-xl bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all`
          }
        >
          {generating ? t("生成中...", "Generating...") : t("AI 提取印花", "AI Extract Print")}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>

      <div
        className={
          `relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-[20px] border p-6 ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-black/[0.05] bg-slate-50/80"}`
        }
      >
        <div className="pointer-events-none absolute inset-4 rounded-[16px] border border-dashed opacity-40" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }} />
        {generating ? (
          <div className="relative z-10 text-center">
            <div className={`mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${isDark ? "border-blue-400" : "border-blue-500"}`} />
            <p className={`mt-4 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("AI 正在生成图片...", "AI is generating the image...")}</p>
          </div>
        ) : result?.result_url ? (
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
              <img src={result.result_url} alt="AI generated" className="mx-auto max-h-[360px] rounded-lg" />
            </div>
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{result.provider} / {result.model} · {t("已保存到素材库", "Saved to Assets")}</p>
          </div>
        ) : (
          <div className="relative z-10 text-center">
            <div className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center ${isDark ? "bg-slate-700/50" : "bg-slate-200/80"}`}>
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("生成结果将显示在这里", "Generated results will appear here")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
