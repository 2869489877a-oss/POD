"use client";

/* eslint-disable @next/next/no-img-element -- Batch previews use local object URLs and generated asset URLs. */

import Link from "next/link";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";

import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";
import { getUploadedImageUrl, type UploadApiResult } from "@/lib/upload-result";

type ProviderOption = {
  display_name: string;
  id: string;
  is_active: boolean;
};

type BatchStatus = "queued" | "uploading" | "generating" | "completed" | "failed";

type BatchItem = {
  assetId?: string;
  error?: string;
  file: File;
  id: string;
  model?: string;
  previewUrl: string;
  provider?: string;
  resultUrl?: string;
  status: BatchStatus;
  uploadUrl?: string;
};

type GenerateResult = {
  asset_id?: string;
  error?: string;
  model?: string;
  provider?: string;
  result_url?: string;
};

type RunOptions = {
  prompt: string;
  providerId?: string;
};

const PRINT_AVOID_TERMS =
  "衣服，模特，人物，身体，背景，墙面，地面，布料纹理，褶皱，阴影，口袋，帽绳，袖子，衣领，裤子，手，低清晰度，模糊，噪点，图案残缺，文字错误，乱码文字，变形文字，多余文字，水印，logo，边框，裁切，重复图案，拍摄光影，商品照片背景，衣架，标签，拉链，纽扣，头发，皮肤";

const PRINT_AVOID_TERMS_EN =
  "clothing, model, person, body, background, wall, floor, fabric texture, wrinkles, shadows, pockets, drawstrings, sleeves, collar, pants, hands, low resolution, blur, noise, incomplete artwork, wrong text, garbled text, distorted text, extra text, watermark, logo, border, cropping, repeated pattern, photo lighting, product photo background, hanger, label, zipper, buttons, hair, skin";

const PRINT_PROMPT_TEMPLATES = [
  {
    nameEn: "Precise Print Extraction",
    nameZh: "精准提取印花",
    promptEn: `Use the uploaded garment photo as reference. Extract only the print artwork from the clothing and rebuild it as a clean, complete, high-resolution standalone print asset. Preserve the main artwork elements, text content, color relationships, overall composition, and style without changing the theme. Output centered artwork with clean edges and complete details, suitable for POD garment printing. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
    promptZh: `请参考上传的服装图片，仅提取衣服上的印花图案，并重新整理为干净、完整、高清的独立印花素材。保留原图中的主要图案元素、文字内容、颜色搭配、整体构图和风格，不要改变主题。输出为居中排版、边缘清晰、细节完整、适合 POD 服装印刷的图案素材。不要包含：${PRINT_AVOID_TERMS}。`,
  },
  {
    nameEn: "HD Print Restoration",
    nameZh: "高清还原印花",
    promptEn: `Identify and restore the print design from the uploaded garment photo. Keep only the print itself. Recreate the original artwork, text, colors, layers, and composition as a high-resolution print asset with clean lines, sharp edges, clear color blocks, and text kept as accurate as possible. Do not generate clothing, people, background, or photographic traces. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
    promptZh: `请从上传的服装照片中识别并还原衣服表面的印花设计，只保留印花本身。按原印花的图案、文字、色彩、层次和构图重新绘制为高清印刷素材，线条干净，边缘锐利，色块清晰，文字尽量保持正确。不要生成服装、人物、背景或摄影痕迹。不要包含：${PRINT_AVOID_TERMS}。`,
  },
  {
    nameEn: "Vector Style Print",
    nameZh: "矢量风印花",
    promptEn: `Reference the garment print in the uploaded image and generate a standalone vector-style artwork asset suitable for garment printing. Preserve the original theme, main visual, text placement, color relationships, and overall style. Improve line clarity and artwork completeness. Output a centered, clean POD print with no extra background. Do not include: ${PRINT_AVOID_TERMS_EN}.`,
    promptZh: `请参考上传图片里的服装印花，生成适合服装印刷的独立矢量风图案素材。保持原始印花主题、主视觉、文字位置、颜色关系和整体风格，增强线条清晰度与图案完整度，输出居中、干净、无多余背景的 POD 印花图。不要包含：${PRINT_AVOID_TERMS}。`,
  },
] as const;

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

const statusLabel: Record<BatchStatus, { en: string; zh: string }> = {
  completed: { en: "Completed", zh: "已完成" },
  failed: { en: "Failed", zh: "失败" },
  generating: { en: "Generating", zh: "生成中" },
  queued: { en: "Queued", zh: "待处理" },
  uploading: { en: "Uploading", zh: "上传中" },
};

function createItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeName(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "print";
}

function imageExtension(url: string, contentType: string | null) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  const match = url.split("?")[0]?.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() ?? "png";
}

export function AiBatchPrintGenerator() {
  const { accent, isDark, language, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<BatchItem[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [templateIndex, setTemplateIndex] = useState(0);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [selectedBackgroundColor, setSelectedBackgroundColor] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState(2);
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const inputClass = `w-full rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-1 ${isDark ? "border-white/[0.08] bg-white/[0.05] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-cyan-400/40" : "border-black/[0.06] bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-cyan-500/30"}`;
  const panelClass = `rounded-[20px] border p-5 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.05] bg-white/70"}`;
  const currentTemplatePrompt =
    language === "zh"
      ? PRINT_PROMPT_TEMPLATES[templateIndex]?.promptZh ?? ""
      : PRINT_PROMPT_TEMPLATES[templateIndex]?.promptEn ?? "";
  const prompt = customPrompt ?? currentTemplatePrompt;

  const stats = useMemo(() => {
    return queue.reduce(
      (current, item) => {
        current.total += 1;
        current[item.status] += 1;
        return current;
      },
      { completed: 0, failed: 0, generating: 0, queued: 0, total: 0, uploading: 0 },
    );
  }, [queue]);
  const selectedItem = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;
  const completedItems = queue.filter((item) => item.status === "completed" && item.resultUrl);
  const canRun = queue.some((item) => item.status === "queued" || item.status === "failed") && Boolean(prompt.trim()) && providers.length > 0;

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    let cancelled = false;
    async function loadProviders() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (cancelled) return;
        const active = (data.providers ?? []).filter((provider: ProviderOption) => provider.is_active);
        setProviders(active);
        setSelectedProvider((current) => current || active[0]?.id || "");
      } catch {
        /* ignore */
      }
    }

    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const item of queueRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  function updateQueue(updater: (items: BatchItem[]) => BatchItem[]) {
    setQueue((current) => {
      const next = updater(current);
      queueRef.current = next;
      return next;
    });
  }

  function updateItem(id: string, patch: Partial<BatchItem>) {
    updateQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const newItems = imageFiles.map((file) => ({
      file,
      id: createItemId(),
      previewUrl: URL.createObjectURL(file),
      status: "queued" as const,
    }));

    updateQueue((items) => [...items, ...newItems]);
    setSelectedId((current) => current ?? newItems[0]?.id ?? null);
    setMessage(null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function removeItem(id: string) {
    const item = queueRef.current.find((current) => current.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    updateQueue((items) => items.filter((current) => current.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function clearQueue(onlyCompleted = false) {
    const removable = onlyCompleted
      ? queueRef.current.filter((item) => item.status === "completed")
      : queueRef.current;

    for (const item of removable) {
      URL.revokeObjectURL(item.previewUrl);
    }

    updateQueue((items) => (onlyCompleted ? items.filter((item) => item.status !== "completed") : []));
    if (!onlyCompleted) setSelectedId(null);
  }

  function buildRunOptions(): RunOptions {
    const backgroundPrompt = BACKGROUND_COLOR_OPTIONS.find((option) => option.id === selectedBackgroundColor);
    const finalPrompt = [
      prompt.trim(),
      backgroundPrompt ? (language === "zh" ? backgroundPrompt.promptZh : backgroundPrompt.promptEn) : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      prompt: finalPrompt,
      providerId: selectedProvider || undefined,
    };
  }

  async function uploadSourceImage(file: File) {
    const formData = new FormData();
    formData.append("files", file);
    const response = await fetch("/api/upload", { body: formData, method: "POST" });
    const data = await response.json();
    const uploadResult = data.results?.[0] as UploadApiResult | undefined;
    const imageUrl = getUploadedImageUrl(uploadResult);

    if (!response.ok || !imageUrl) {
      throw new Error(uploadResult?.error || data.error || t("图片上传失败", "Image upload failed"));
    }

    return imageUrl;
  }

  async function processItem(id: string, options: RunOptions) {
    const item = queueRef.current.find((current) => current.id === id);
    if (!item) return;

    updateItem(id, {
      error: undefined,
      model: undefined,
      provider: undefined,
      resultUrl: undefined,
      status: item.uploadUrl ? "generating" : "uploading",
    });

    try {
      const imageUrl = item.uploadUrl ?? await uploadSourceImage(item.file);
      if (!item.uploadUrl) {
        updateItem(id, { status: "generating", uploadUrl: imageUrl });
      }

      const response = await fetch("/api/ai/generate-image", {
        body: JSON.stringify({
          height: 1024,
          prompt: options.prompt,
          provider_id: options.providerId,
          reference_url: imageUrl,
          save_to_assets: true,
          width: 1024,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as GenerateResult;

      if (!response.ok || !data.result_url) {
        throw new Error(data.error || t("生成失败", "Generation failed"));
      }

      updateItem(id, {
        assetId: data.asset_id,
        model: data.model,
        provider: data.provider,
        resultUrl: data.result_url,
        status: "completed",
      });
    } catch (error) {
      updateItem(id, {
        error: error instanceof Error ? error.message : t("生成失败", "Generation failed"),
        status: "failed",
      });
    }
  }

  async function runBatch() {
    if (running || !canRun) return;
    const options = buildRunOptions();
    const targets = queueRef.current
      .filter((item) => item.status === "queued" || item.status === "failed")
      .map((item) => item.id);

    setRunning(true);
    setMessage(t(`正在处理 ${targets.length} 张图片...`, `Processing ${targets.length} image(s)...`));

    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const id = targets[cursor];
        cursor += 1;
        await processItem(id, options);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
    setRunning(false);
    setMessage(t("批量队列处理完成", "Batch queue complete"));
  }

  async function retryItem(id: string) {
    if (running || !prompt.trim()) return;
    setRunning(true);
    await processItem(id, buildRunOptions());
    setRunning(false);
  }

  async function downloadZip() {
    if (completedItems.length === 0 || downloading) return;
    setDownloading(true);
    setMessage(null);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const [index, item] of completedItems.entries()) {
        if (!item.resultUrl) continue;
        const response = await fetch(item.resultUrl);
        if (!response.ok) throw new Error(`${item.file.name}: ${response.statusText}`);
        const blob = await response.blob();
        const ext = imageExtension(item.resultUrl, response.headers.get("content-type"));
        zip.file(`${String(index + 1).padStart(3, "0")}-${sanitizeName(item.file.name)}.${ext}`, blob);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ai-print-batch-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("下载 ZIP 失败", "Failed to download ZIP"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>
            {t("多图对应多图队列", "One input image, one output queue")}
          </p>
          <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
            {t("每张图片独立上传、独立生成、独立保存到素材库。", "Each image uploads, generates, and saves to Assets independently.")}
          </p>
        </div>
        <Link
          href="/ai-image"
          className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${isDark ? "border-white/[0.08] text-slate-300 hover:bg-white/[0.05]" : "border-black/[0.06] text-slate-700 hover:bg-black/[0.03]"}`}
        >
          {t("返回单图页面", "Back to Single Image")}
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(440px,0.82fr)_minmax(560px,1fr)]">
        <section className={panelClass}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                {t("选择模型", "Model")}
              </label>
              {providers.length === 0 ? (
                <p className="text-sm text-amber-500">{t("请先在设置页添加 AI 模型", "Add an AI model in Settings first")}</p>
              ) : (
                <select value={selectedProvider} onChange={(event) => setSelectedProvider(event.target.value)} className={inputClass}>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.display_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                {t("并发数量", "Concurrency")}
              </label>
              <select value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} className={inputClass}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("上传多张原图", "Upload Source Images")}
            </label>
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${
                dragging
                  ? isDark ? "border-cyan-400 bg-cyan-500/10" : "border-cyan-400 bg-cyan-50"
                  : isDark ? "border-white/10 bg-slate-800/30 hover:border-white/20" : "border-slate-300 bg-slate-50 hover:border-slate-400"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <svg className={`mx-auto h-9 w-9 ${isDark ? "text-slate-500" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className={`mt-2 text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                {t("拖拽多张图片到此处，或点击选择", "Drag multiple images here, or click to choose")}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {t("支持 jpg、png、webp；每张会对应生成一张印花图", "Supports jpg, png, webp; each input creates one print output")}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("常用模板", "Prompt Templates")}
            </label>
            <select
              value={templateIndex}
              onChange={(event) => {
                setTemplateIndex(Number(event.target.value));
                setCustomPrompt(null);
              }}
              className={inputClass}
            >
              {PRINT_PROMPT_TEMPLATES.map((template, index) => (
                <option key={template.nameEn} value={index}>
                  {t(template.nameZh, template.nameEn)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("提示词 (Prompt)", "Prompt")}
            </label>
            <textarea
              value={prompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              rows={7}
              className={inputClass}
              placeholder={t("批量提取印花提示词...", "Batch print extraction prompt...")}
            />
          </div>

          <div className="mt-4">
            <label className={`mb-2 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("底色", "Background Color")}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BACKGROUND_COLOR_OPTIONS.map((option) => {
                const selected = selectedBackgroundColor === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedBackgroundColor((current) => (current === option.id ? null : option.id))}
                    className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
                      selected
                        ? `border-transparent bg-gradient-to-r ${colors.gradient} text-white`
                        : isDark
                          ? "border-white/[0.08] bg-white/[0.04] text-slate-300 hover:border-white/[0.14]"
                          : "border-black/[0.06] bg-white text-slate-700 hover:border-black/[0.12]"
                    }`}
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
                      {selected ? <span className="absolute inset-0 flex items-center justify-center bg-white/90 text-[11px] font-bold text-slate-950">✓</span> : null}
                    </span>
                    <span>{t(option.zh, option.en)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void runBatch()}
              disabled={!canRun || running}
              className={`rounded-xl bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none`}
            >
              {running ? t("批量处理中...", "Batch running...") : t("开始批量提取", "Start Batch Extraction")}
            </button>
            <button
              type="button"
              onClick={() => void downloadZip()}
              disabled={completedItems.length === 0 || downloading}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? "border-white/[0.08] text-slate-300 hover:bg-white/[0.05]" : "border-black/[0.06] text-slate-700 hover:bg-black/[0.03]"}`}
            >
              {downloading ? t("打包中...", "Zipping...") : t("下载成功结果 ZIP", "Download ZIP")}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => clearQueue(true)}
              disabled={running || stats.completed === 0}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${isDark ? "bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {t("清理已完成", "Clear Completed")}
            </button>
            <button
              type="button"
              onClick={() => clearQueue(false)}
              disabled={running || queue.length === 0}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-40 ${isDark ? "bg-red-500/10 text-red-300 hover:bg-red-500/15" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
            >
              {t("清空队列", "Clear Queue")}
            </button>
          </div>

          {message ? <p className={`mt-3 text-sm ${message.includes("失败") || message.toLowerCase().includes("failed") ? "text-red-500" : isDark ? "text-slate-400" : "text-slate-500"}`}>{message}</p> : null}
        </section>

        <section className={panelClass}>
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              { label: t("总数", "Total"), value: stats.total },
              { label: t("待处理", "Queued"), value: stats.queued },
              { label: t("处理中", "Running"), value: stats.uploading + stats.generating },
              { label: t("成功", "Done"), value: stats.completed },
              { label: t("失败", "Failed"), value: stats.failed },
            ].map((stat) => (
              <div key={stat.label} className={`rounded-2xl border p-3 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.05] bg-white/80"}`}>
                <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>{stat.label}</p>
                <p className={`mt-1 text-xl font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className={`max-h-[680px] overflow-y-auto rounded-2xl border ${isDark ? "border-white/[0.08] bg-slate-950/20" : "border-black/[0.05] bg-slate-50"}`}>
              {queue.length === 0 ? (
                <div className={`p-6 text-sm ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                  {t("上传多张图片后，任务会显示在这里。", "Upload images and tasks will appear here.")}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {queue.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`grid w-full grid-cols-[56px_1fr] gap-3 p-3 text-left transition ${
                        selectedItem?.id === item.id
                          ? isDark ? "bg-cyan-500/10" : "bg-cyan-50"
                          : isDark ? "hover:bg-white/[0.03]" : "hover:bg-white"
                      }`}
                    >
                      <img src={item.previewUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      <span className="min-w-0">
                        <span className={`block truncate text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-900"}`}>
                          {String(index + 1).padStart(2, "0")} · {item.file.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : item.status === "failed"
                                ? "bg-red-500/10 text-red-400"
                                : item.status === "queued"
                                  ? isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-200 text-slate-600"
                                  : "bg-amber-500/10 text-amber-400"
                          }`}>
                            {t(statusLabel[item.status].zh, statusLabel[item.status].en)}
                          </span>
                          {item.model ? <span className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-500"}`}>{item.model}</span> : null}
                        </span>
                        {item.error ? <span className="mt-1 line-clamp-1 block text-xs text-red-400">{item.error}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={`min-h-[520px] rounded-2xl border p-4 ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-black/[0.05] bg-white/80"}`}>
              {selectedItem ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className={`truncate text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{selectedItem.file.name}</h3>
                      <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                        {t(statusLabel[selectedItem.status].zh, statusLabel[selectedItem.status].en)}
                        {selectedItem.provider ? ` · ${selectedItem.provider}` : ""}
                        {selectedItem.model ? ` / ${selectedItem.model}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.status === "failed" ? (
                        <button
                          type="button"
                          onClick={() => void retryItem(selectedItem.id)}
                          disabled={running}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-700"}`}
                        >
                          {t("重试", "Retry")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem(selectedItem.id)}
                        disabled={running && (selectedItem.status === "uploading" || selectedItem.status === "generating")}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-red-500/10 text-red-300" : "bg-red-50 text-red-600"}`}
                      >
                        {t("移除", "Remove")}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className={`mb-2 text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("原图", "Source")}</p>
                      <div className={`flex min-h-[360px] items-center justify-center rounded-2xl border p-3 ${isDark ? "border-white/[0.08] bg-slate-950/30" : "border-black/[0.05] bg-slate-50"}`}>
                        <img src={selectedItem.previewUrl} alt={selectedItem.file.name} className="max-h-[340px] rounded-xl object-contain" />
                      </div>
                    </div>
                    <div>
                      <p className={`mb-2 text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{t("结果", "Result")}</p>
                      <div
                        className={`flex min-h-[360px] items-center justify-center rounded-2xl border p-3 ${isDark ? "border-white/[0.08]" : "border-black/[0.05]"}`}
                        style={{
                          backgroundColor: "#fff",
                          backgroundImage:
                            "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                          backgroundSize: "16px 16px",
                        }}
                      >
                        {selectedItem.status === "uploading" || selectedItem.status === "generating" ? (
                          <div className="text-center">
                            <div className={`mx-auto h-9 w-9 animate-spin rounded-full border-2 border-t-transparent ${isDark ? "border-cyan-400" : "border-cyan-500"}`} />
                            <p className="mt-3 text-sm text-slate-500">
                              {selectedItem.status === "uploading" ? t("正在上传原图...", "Uploading source image...") : t("AI 正在生成印花...", "AI is generating print...")}
                            </p>
                          </div>
                        ) : selectedItem.resultUrl ? (
                          <img src={selectedItem.resultUrl} alt="AI generated print" className="max-h-[340px] rounded-xl object-contain shadow-lg" />
                        ) : selectedItem.error ? (
                          <p className="max-w-sm text-center text-sm text-red-500">{selectedItem.error}</p>
                        ) : (
                          <p className="text-sm text-slate-500">{t("等待生成结果", "Waiting for result")}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedItem.resultUrl ? (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={selectedItem.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        {t("打开结果图", "Open Result")}
                      </a>
                      <span className={`rounded-lg px-3 py-2 text-xs ${isDark ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
                        {t("已自动保存到素材库", "Saved to Assets")}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[520px] items-center justify-center text-center">
                  <div>
                    <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full ${isDark ? "bg-slate-700/50" : "bg-slate-200/80"}`}>
                      <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                      </svg>
                    </div>
                    <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-500"}`}>{t("选择任务后预览原图和结果", "Select a task to preview source and result")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
