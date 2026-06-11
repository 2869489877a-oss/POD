"use client";

/* eslint-disable @next/next/no-img-element -- Local previews and generated asset URLs are user-selected image content. */

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";

import { ImageCropDialog } from "@/components/image-crop-dialog";
import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";
import { getUploadedImageUrl, type UploadApiResult } from "@/lib/upload-result";

type ProviderOption = {
  display_name: string;
  id: string;
  is_active: boolean;
};

type GridSourceItem = {
  cropped?: boolean;
  file: File;
  id: string;
  previewUrl: string;
};

type GridStatus = "idle" | "compositing" | "uploading" | "generating" | "splitting" | "completed" | "failed" | "cancelled";

type GenerateResult = {
  asset_id?: string;
  error?: string;
  job_id?: string;
  model?: string;
  provider?: string;
  result_url?: string;
};

type SplitGridPiece = {
  asset_id: string | null;
  filename: string;
  height: number;
  index: number;
  result_url: string | null;
  source_name: string | null;
  width: number;
};

type SplitGridResult = {
  columns?: number;
  error?: string;
  height?: number;
  pieces?: SplitGridPiece[];
  rows?: number;
  width?: number;
};

type UploadGridResult = {
  error?: string;
  results?: UploadApiResult[];
};

type CropRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type BuiltGridImage = {
  file: File;
  height: number;
  width: number;
};

type AiGridPrintGeneratorProps = {
  gridSize?: 2 | 3;
};

const PRINT_AVOID_TERMS =
  "衣服，模特，人物，身体，背景，墙面，地面，布料纹理，褶皱，阴影，口袋，帽绳，袖子，衣领，裤子，手，低清晰度，模糊，噪点，图案残缺，文字错误，乱码文字，变形文字，多余文字，水印，logo，边框，裁切，重复图案，拍摄光影，商品照片背景，衣架，标签，拉链，纽扣，头发，皮肤";

const PRINT_AVOID_TERMS_EN =
  "clothing, model, person, body, background, wall, floor, fabric texture, wrinkles, shadows, pockets, drawstrings, sleeves, collar, pants, hands, low resolution, blur, noise, incomplete artwork, wrong text, garbled text, distorted text, extra text, watermark, logo, border, cropping, repeated pattern, photo lighting, product photo background, hanger, label, zipper, buttons, hair, skin";

const BACKGROUND_COLOR_OPTIONS = [
  { id: "transparent", zh: "透明", en: "Transparent", swatch: "transparent" },
  { id: "white", zh: "白色", en: "White", swatch: "#ffffff" },
  { id: "black", zh: "黑色", en: "Black", swatch: "#111827" },
  { id: "gray", zh: "灰色", en: "Gray", swatch: "#9ca3af" },
  { id: "red", zh: "红色", en: "Red", swatch: "#ef4444" },
  { id: "orange", zh: "橙色", en: "Orange", swatch: "#f97316" },
  { id: "yellow", zh: "黄色", en: "Yellow", swatch: "#facc15" },
  { id: "green", zh: "绿色", en: "Green", swatch: "#22c55e" },
  { id: "cyan", zh: "青色", en: "Cyan", swatch: "#06b6d4" },
  { id: "blue", zh: "蓝色", en: "Blue", swatch: "#3b82f6" },
  { id: "purple", zh: "紫色", en: "Purple", swatch: "#8b5cf6" },
  { id: "pink", zh: "粉色", en: "Pink", swatch: "#ec4899" },
] as const;

type BackgroundColorOption = (typeof BACKGROUND_COLOR_OPTIONS)[number];

function gridDisplayName(gridSize: number, language: "zh" | "en") {
  if (language === "zh") return gridSize === 2 ? "四宫格" : "九宫格";
  return `${gridSize}x${gridSize} grid`;
}

function buildGridPrompt(gridSize: number, language: "zh" | "en") {
  const label = `${gridSize}x${gridSize}`;
  const total = gridSize * gridSize;
  const zhName = gridDisplayName(gridSize, "zh");

  if (language === "zh") {
    return `这张参考图是 ${label} ${zhName}拼图，每个格子对应一张不同衣服图片中的印花。请按从左到右、从上到下的顺序分别提取 ${total} 个格子里的印花，不要把不同格子的图案混合，不要跨格生成。输出仍保持 ${label} ${zhName}布局，每个格子分别对应原始 ${total} 张图的印花。整张 ${label} 母图需要保持高分辨率和高锐度，细节清晰，适合 300dpi POD 服装印刷；拆分后的每个子图也要保持清晰、完整、可直接用于印刷。每个格子只保留对应的独立印花图案，居中、边缘清晰、细节完整。不要包含：${PRINT_AVOID_TERMS}。`;
  }

  return `The reference image is a ${label} grid. Each cell comes from a different garment photo and contains one print design. Extract the ${total} print designs separately from left to right and top to bottom. Do not blend designs across cells. Keep the output as a ${label} grid, with each cell corresponding to its original source image. The full ${label} master image must stay high-resolution, sharp, detailed, and suitable for 300dpi POD garment printing; each split cell should remain clear, complete, and ready for print use. Each cell should contain only its matching standalone print artwork, centered, clean-edged, and detailed. Do not include: ${PRINT_AVOID_TERMS_EN}.`;
}

function buildBackgroundPrompt(option: BackgroundColorOption, totalCells: number, language: "zh" | "en") {
  const colorZh = option.zh;
  const colorEn = option.en.toLowerCase();

  if (language === "zh") {
    return `所有 ${totalCells} 个格子都换成${colorZh}底。`;
  }

  return `Change all ${totalCells} cell backgrounds to ${colorEn}.`;
}

function createItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeName(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "print";
}

function stripImageExtension(value: string) {
  return value.replace(/\.(png|jpe?g|webp)$/i, "");
}

function getPrintCrop(width: number, height: number): CropRect {
  const portrait = height > width * 1.1;
  const landscape = width > height * 1.2;
  const cropWidthRatio = portrait ? 0.78 : landscape ? 0.68 : 0.76;
  const cropHeightRatio = portrait ? 0.64 : landscape ? 0.78 : 0.76;
  const cropWidth = Math.max(1, Math.round(width * cropWidthRatio));
  const cropHeight = Math.max(1, Math.round(height * cropHeightRatio));
  const x = Math.max(0, Math.round((width - cropWidth) / 2));
  const preferredY = portrait ? Math.round(height * 0.18) : Math.round((height - cropHeight) / 2);
  const y = Math.max(0, Math.min(height - cropHeight, preferredY));

  return {
    height: cropHeight,
    width: cropWidth,
    x,
    y,
  };
}

function fullCrop(width: number, height: number): CropRect {
  return { height, width, x: 0, y: 0 };
}

async function canvasToFile(canvas: HTMLCanvasElement, baseName: string) {
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法创建拼图文件"));
    }, "image/png");
  });

  if (pngBlob.size <= 18 * 1024 * 1024) {
    return new File([pngBlob], `${baseName}.png`, { type: "image/png" });
  }

  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("无法压缩拼图文件"));
      },
      "image/webp",
      0.96,
    );
  });

  return new File([webpBlob], `${baseName}.webp`, { type: "image/webp" });
}

async function buildGridImage(items: GridSourceItem[], autoCrop: boolean, gridSize: number): Promise<BuiltGridImage> {
  const totalCells = gridSize * gridSize;

  if (items.length !== totalCells) {
    throw new Error(`需要刚好 ${totalCells} 张图片才能生成 ${gridSize}x${gridSize} 拼图`);
  }

  const bitmaps = await Promise.all(items.map((item) => createImageBitmap(item.file)));
  try {
    const crops = bitmaps.map((bitmap) => (autoCrop ? getPrintCrop(bitmap.width, bitmap.height) : fullCrop(bitmap.width, bitmap.height)));
    const cellWidth = Math.max(...crops.map((crop) => crop.width));
    const cellHeight = Math.max(...crops.map((crop) => crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = cellWidth * gridSize;
    canvas.height = cellHeight * gridSize;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("无法创建拼图画布");
    }

    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    bitmaps.forEach((bitmap, index) => {
      const crop = crops[index];
      const column = index % gridSize;
      const row = Math.floor(index / gridSize);
      const dx = column * cellWidth + Math.floor((cellWidth - crop.width) / 2);
      const dy = row * cellHeight + Math.floor((cellHeight - crop.height) / 2);
      context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, dx, dy, crop.width, crop.height);
    });

    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(8, Math.round(Math.min(cellWidth, cellHeight) * 0.008));
    context.beginPath();
    for (let line = 1; line < gridSize; line += 1) {
      context.moveTo(cellWidth * line, 0);
      context.lineTo(cellWidth * line, canvas.height);
      context.moveTo(0, cellHeight * line);
      context.lineTo(canvas.width, cellHeight * line);
    }
    context.stroke();

    return {
      file: await canvasToFile(canvas, `ai-print-grid-${Date.now()}`),
      height: canvas.height,
      width: canvas.width,
    };
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}

async function readJsonResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text.slice(0, 500) } as T;
  }
}

function imageExtension(url: string, contentType: string | null) {
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  const match = url.split("?")[0]?.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() ?? "png";
}

export function AiGridPrintGenerator({ gridSize = 2 }: AiGridPrintGeneratorProps) {
  const { accent, isDark, language, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const totalCells = gridSize * gridSize;
  const gridLabel = `${gridSize}x${gridSize}`;
  const gridNameZh = gridDisplayName(gridSize, "zh");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [items, setItems] = useState<GridSourceItem[]>([]);
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true);
  const [selectedBackgroundColor, setSelectedBackgroundColor] = useState<string | null>("transparent");
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [gridPreviewUrl, setGridPreviewUrl] = useState<string | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ height: number; width: number } | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [splitPieces, setSplitPieces] = useState<SplitGridPiece[]>([]);
  const [status, setStatus] = useState<GridStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const promptBase = customPrompt ?? buildGridPrompt(gridSize, language);
  const backgroundPrompt = BACKGROUND_COLOR_OPTIONS.find((option) => option.id === selectedBackgroundColor);
  const finalPrompt = [
    promptBase.trim(),
    backgroundPrompt ? buildBackgroundPrompt(backgroundPrompt, totalCells, language) : "",
  ]
    .filter(Boolean)
    .join(" ");
  const cropTargetItem = items.find((item) => item.id === cropTargetId) ?? null;
  const running = status === "compositing" || status === "uploading" || status === "generating" || status === "splitting";
  const canRun = items.length === totalCells && providers.length > 0 && Boolean(finalPrompt.trim()) && !running;
  const panelClass = `rounded-[20px] border p-5 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.05] bg-white/70"}`;
  const inputClass = `w-full rounded-xl border px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-1 ${isDark ? "border-white/[0.08] bg-white/[0.05] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-cyan-400/40" : "border-black/[0.06] bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-cyan-500/30"}`;
  const statusLabel =
    status === "compositing"
      ? t("拼图中", "Compositing")
      : status === "uploading"
        ? t("上传中", "Uploading")
        : status === "generating"
          ? t("AI 生成中", "Generating")
          : status === "splitting"
            ? t("拆图保存中", "Splitting")
            : status === "completed"
              ? t("已完成", "Completed")
              : status === "failed"
                ? t("失败", "Failed")
                : status === "cancelled"
                  ? t("已取消", "Cancelled")
                  : t("等待开始", "Ready");
  const statusClass =
    status === "completed"
      ? "bg-emerald-500/10 text-emerald-400"
      : status === "failed"
        ? "bg-red-500/10 text-red-400"
        : running
          ? "bg-amber-500/10 text-amber-400"
          : isDark
            ? "bg-white/[0.06] text-slate-400"
            : "bg-slate-100 text-slate-600";

  const sourceNames = useMemo(() => items.map((item, index) => `${String(index + 1).padStart(2, "0")}-${sanitizeName(item.file.name)}`), [items]);

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const response = await fetch("/api/ai-providers");
        const data = await response.json();
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
      abortControllerRef.current?.abort();
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      if (gridPreviewUrl) URL.revokeObjectURL(gridPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetGeneratedState() {
    if (gridPreviewUrl) URL.revokeObjectURL(gridPreviewUrl);
    setGridPreviewUrl(null);
    setGridDimensions(null);
    setUploadUrl(null);
    setGeneratedUrl(null);
    setSplitPieces([]);
    setStatus("idle");
    setError(null);
    setMessage(null);
  }

  function addFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    resetGeneratedState();

    const remainingSlots = Math.max(0, totalCells - items.length);
    if (imageFiles.length > remainingSlots) {
      setMessage(t(`${gridNameZh}一次只处理 ${totalCells} 张图片，超出的图片未加入。`, `A ${gridLabel} grid handles ${totalCells} images at a time. Extra images were not added.`));
    }

    setItems((current) => {
      const slots = Math.max(0, totalCells - current.length);
      const nextFiles = imageFiles.slice(0, slots).map((file) => ({
        file,
        id: createItemId(),
        previewUrl: URL.createObjectURL(file),
      }));
      return [...current, ...nextFiles];
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function clearSources() {
    abortControllerRef.current?.abort();
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    setCropTargetId(null);
    resetGeneratedState();
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
    if (cropTargetId === id) setCropTargetId(null);
    resetGeneratedState();
  }

  function applyCropToItem(id: string, croppedFile: File) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        URL.revokeObjectURL(item.previewUrl);
        return {
          ...item,
          cropped: true,
          file: croppedFile,
          previewUrl: URL.createObjectURL(croppedFile),
        };
      }),
    );
    setCropTargetId(null);
    resetGeneratedState();
  }

  async function uploadSourceImage(file: File, signal: AbortSignal) {
    const formData = new FormData();
    formData.append("files", file);
    const response = await fetch("/api/upload", { body: formData, method: "POST", signal });
    const data = await readJsonResponse<UploadGridResult>(response);
    const uploadResult = data.results?.[0];
    const imageUrl = getUploadedImageUrl(uploadResult);

    if (!response.ok || !imageUrl) {
      throw new Error(uploadResult?.error || data.error || t("拼图上传失败", "Grid upload failed"));
    }

    return imageUrl;
  }

  async function splitGeneratedResult(resultUrl: string, signal?: AbortSignal) {
    const response = await fetch("/api/ai/split-grid", {
      body: JSON.stringify({
        columns: gridSize,
        image_url: resultUrl,
        rows: gridSize,
        save_to_assets: true,
        source_names: sourceNames,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    });
    const data = await readJsonResponse<SplitGridResult>(response);

    if (!response.ok || !data.pieces?.length) {
      throw new Error(data.error || t(`拆分${gridNameZh}结果失败`, `Failed to split ${gridLabel} result`));
    }

    setSplitPieces(data.pieces);
    return data.pieces;
  }

  async function runGridExtraction() {
    if (!canRun) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setError(null);
    setMessage(null);
    setSplitPieces([]);
    setGeneratedUrl(null);

    try {
      setStatus("compositing");
      const grid = await buildGridImage(items, autoCrop, gridSize);
      if (gridPreviewUrl) URL.revokeObjectURL(gridPreviewUrl);
      setGridPreviewUrl(URL.createObjectURL(grid.file));
      setGridDimensions({ height: grid.height, width: grid.width });

      setStatus("uploading");
      const imageUrl = await uploadSourceImage(grid.file, controller.signal);
      setUploadUrl(imageUrl);

      setStatus("generating");
      const response = await fetch("/api/ai/generate-image", {
        body: JSON.stringify({
          height: grid.height,
          prompt: finalPrompt,
          provider_id: selectedProvider || undefined,
          reference_url: imageUrl,
          save_to_assets: true,
          width: grid.width,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const data = await readJsonResponse<GenerateResult>(response);

      if (!response.ok || !data.result_url) {
        throw new Error(data.error || t("AI 生成失败", "AI generation failed"));
      }

      setGeneratedUrl(data.result_url);
      setStatus("splitting");
      await splitGeneratedResult(data.result_url, controller.signal);
      setStatus("completed");
      setMessage(t(`${gridNameZh}已生成并拆分为 ${totalCells} 张图片，结果已保存到素材库。`, `The ${gridLabel} grid was generated and split into ${totalCells} images. Results were saved to Assets.`));
    } catch (runError) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        setMessage(t(`${gridNameZh}任务已取消。`, `${gridLabel} task cancelled.`));
      } else {
        setStatus("failed");
        setError(runError instanceof Error ? runError.message : t(`${gridNameZh}任务失败`, `${gridLabel} task failed`));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  async function downloadImage(url: string, baseName: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.statusText || `HTTP ${response.status}`);
      const blob = await response.blob();
      const ext = imageExtension(url, response.headers.get("content-type"));
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${sanitizeName(stripImageExtension(baseName))}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setMessage(downloadError instanceof Error ? downloadError.message : t("下载失败", "Download failed"));
    }
  }

  async function downloadSplitZip() {
    if (splitPieces.length === 0) return;
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const piece of splitPieces) {
        if (!piece.result_url) continue;
        const response = await fetch(piece.result_url);
        if (!response.ok) throw new Error(`${piece.filename}: ${response.statusText}`);
        const blob = await response.blob();
        zip.file(piece.filename, blob);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ai-${gridLabel}-grid-split-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (zipError) {
      setMessage(zipError instanceof Error ? zipError.message : t("下载 ZIP 失败", "Failed to download ZIP"));
    }
  }

  return (
    <section className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? "text-cyan-300" : "text-cyan-700"}`}>
            {t(`${gridLabel} 拼图剪图板块`, `${gridLabel} Grid Crop Board`)}
          </p>
          <h2 className={`mt-2 text-xl font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
            {t(`${totalCells} 张图拼成 ${gridLabel}，一次 AI 提取 ${totalCells} 张印花`, `Combine ${totalCells} images into a ${gridLabel} grid and extract ${totalCells} prints in one AI run`)}
          </h2>
          <p className={`mt-2 max-w-4xl text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            {t(
              `上传 ${totalCells} 张衣服图后，系统会先按中心印花区域自动裁剪，不降低原始像素，再拼成 ${gridLabel} 参考图发给 AI。AI 成品图会自动按${gridNameZh}拆成 ${totalCells} 张并保存到素材库。`,
              `Upload ${totalCells} garment images. The system auto-crops the central print area without downscaling source pixels, builds a ${gridLabel} reference grid, sends it to AI, then splits the generated result into ${totalCells} saved assets.`,
            )}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(440px,0.88fr)_minmax(560px,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
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

            <label
              className={`flex min-h-[66px] items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${isDark ? "border-white/[0.08] bg-white/[0.04] text-slate-300" : "border-black/[0.06] bg-white text-slate-700"}`}
            >
              <span>
                <span className="block">{t("自动中心裁剪", "Auto center crop")}</span>
                <span className={`mt-0.5 block text-xs font-normal ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                  {t("优先保留胸前/中心印花区域", "Prioritizes chest or central print area")}
                </span>
              </span>
              <input
                checked={autoCrop}
                onChange={(event) => {
                  setAutoCrop(event.target.checked);
                  resetGeneratedState();
                }}
                type="checkbox"
                className="h-5 w-5 accent-emerald-500"
              />
            </label>
          </div>

          <div>
            <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t(`上传 ${totalCells} 张原图`, `Upload ${totalCells} source images`)}
            </label>
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition ${
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
                {t(`拖拽 ${totalCells} 张图片到此处，或点击选择`, `Drag ${totalCells} images here, or click to choose`)}
              </p>
              <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {t(`已选择 ${items.length} / ${totalCells} 张`, `${items.length} / ${totalCells} selected`)}
              </p>
            </div>
          </div>

          {items.length > 0 ? (
            <div className={gridSize === 3 ? "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3" : "grid grid-cols-2 gap-3"}>
              {items.map((item, index) => (
                <article key={item.id} className={`rounded-2xl border p-3 ${isDark ? "border-white/[0.08] bg-slate-950/20" : "border-black/[0.05] bg-white/80"}`}>
                  <div className="flex items-start gap-3">
                    <img src={item.previewUrl} alt={item.file.name} className="h-20 w-20 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-900"}`}>
                        {index + 1}. {item.file.name}
                      </p>
                      <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                        {item.cropped ? t("已手动裁剪", "Manually cropped") : t("将自动中心裁剪", "Auto center crop")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCropTargetId(item.id)}
                          disabled={running}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${isDark ? "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"}`}
                        >
                          {t("裁剪", "Crop")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={running}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${isDark ? "bg-red-500/10 text-red-300 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                        >
                          {t("移除", "Remove")}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <div>
            <label className={`mb-1.5 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t(`${gridNameZh}提示词`, `${gridLabel} grid prompt`)}
            </label>
            <textarea
              value={promptBase}
              onChange={(event) => {
                setCustomPrompt(event.target.value);
                resetGeneratedState();
              }}
              rows={6}
              className={inputClass}
            />
          </div>

          <div>
            <label className={`mb-2 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("结果底色", "Result Background")}
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

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <button
              type="button"
              onClick={() => void runGridExtraction()}
              disabled={!canRun}
              className={`rounded-xl bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none`}
            >
              {running ? statusLabel : t("拼图并生成", "Build Grid and Generate")}
            </button>
            <button
              type="button"
              onClick={() => abortControllerRef.current?.abort()}
              disabled={!running}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? "border-red-400/30 text-red-300 hover:bg-red-500/10" : "border-red-200 text-red-600 hover:bg-red-50"}`}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              onClick={clearSources}
              disabled={running || items.length === 0}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${isDark ? "border-white/[0.08] text-slate-300 hover:bg-white/[0.05]" : "border-black/[0.06] text-slate-700 hover:bg-black/[0.03]"}`}
            >
              {t("清空", "Clear")}
            </button>
          </div>

          {message ? <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>{message}</p> : null}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>

        <div className="space-y-4">
          <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.08] bg-slate-950/20" : "border-black/[0.05] bg-white/80"}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{t("拼图预览", "Grid Preview")}</h3>
              <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                {gridDimensions ? `${gridDimensions.width} x ${gridDimensions.height}` : t("未生成", "Not built")}
              </span>
            </div>
            <div className={`flex min-h-[320px] items-center justify-center rounded-2xl border p-3 ${isDark ? "border-white/[0.08] bg-slate-950/30" : "border-black/[0.05] bg-slate-50"}`}>
              {gridPreviewUrl ? (
                <img src={gridPreviewUrl} alt={`${gridLabel} grid preview`} className="max-h-[360px] rounded-xl object-contain shadow-lg" />
              ) : (
                <p className="text-sm text-slate-500">{t(`点击“拼图并生成”后会先看到 ${gridLabel} 参考图。`, `Click Build Grid and Generate to preview the ${gridLabel} reference image first.`)}</p>
              )}
            </div>
            {uploadUrl ? (
              <a href={uploadUrl} target="_blank" rel="noreferrer" className={`mt-3 inline-flex text-xs font-semibold ${isDark ? "text-cyan-300" : "text-cyan-700"}`}>
                {t("打开已上传拼图", "Open uploaded grid")}
              </a>
            ) : null}
          </div>

          <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.08] bg-slate-950/20" : "border-black/[0.05] bg-white/80"}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-950"}`}>{t(`AI 成品和${gridNameZh}拆分`, `AI Result and ${gridLabel} Split Pieces`)}</h3>
              <div className="flex flex-wrap gap-2">
                {generatedUrl && splitPieces.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => void splitGeneratedResult(generatedUrl)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"}`}
                  >
                    {t(`拆分成 ${totalCells} 张`, `Split into ${totalCells}`)}
                  </button>
                ) : null}
                {splitPieces.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void downloadSplitZip()}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"}`}
                  >
                    {t("下载拆分 ZIP", "Download split ZIP")}
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className={`flex min-h-[320px] items-center justify-center rounded-2xl border p-3 ${isDark ? "border-white/[0.08]" : "border-black/[0.05]"}`}
              style={{
                backgroundColor: "#fff",
                backgroundImage:
                  "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                backgroundSize: "16px 16px",
              }}
            >
              {running ? (
                <div className="text-center">
                  <div className={`mx-auto h-9 w-9 animate-spin rounded-full border-2 border-t-transparent ${isDark ? "border-cyan-400" : "border-cyan-500"}`} />
                  <p className="mt-3 text-sm text-slate-500">{statusLabel}</p>
                </div>
              ) : generatedUrl ? (
                <img src={generatedUrl} alt="AI generated grid" className="max-h-[360px] rounded-xl object-contain shadow-lg" />
              ) : (
                <p className="text-sm text-slate-500">{t(`AI 成品图会显示在这里，并自动拆成 ${totalCells} 张。`, `The AI result appears here and will be split into ${totalCells} pieces automatically.`)}</p>
              )}
            </div>

            {splitPieces.length > 0 ? (
              <div className={gridSize === 3 ? "mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" : "mt-4 grid gap-3 sm:grid-cols-2"}>
                {splitPieces.map((piece) => (
                  <article key={piece.index} className={`rounded-2xl border p-3 ${isDark ? "border-white/[0.08] bg-white/[0.025]" : "border-black/[0.05] bg-white/80"}`}>
                    <div
                      className="flex min-h-[180px] items-center justify-center rounded-xl border border-black/[0.04] bg-white p-2"
                      style={{
                        backgroundImage:
                          "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                        backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
                        backgroundSize: "12px 12px",
                      }}
                    >
                      {piece.result_url ? <img src={piece.result_url} alt={piece.filename} className="max-h-[180px] rounded-lg object-contain" /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-900"}`}>{piece.filename}</p>
                        <p className={`mt-0.5 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>{piece.width} x {piece.height}</p>
                      </div>
                      {piece.result_url ? (
                        <button
                          type="button"
                          onClick={() => void downloadImage(piece.result_url!, piece.filename)}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold ${isDark ? "bg-cyan-500/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"}`}
                        >
                          {t("下载", "Download")}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {cropTargetItem ? (
        <ImageCropDialog
          file={cropTargetItem.file}
          onApply={(croppedFile) => applyCropToItem(cropTargetItem.id, croppedFile)}
          onCancel={() => setCropTargetId(null)}
          open={Boolean(cropTargetItem)}
          previewUrl={cropTargetItem.previewUrl}
        />
      ) : null}
    </section>
  );
}
