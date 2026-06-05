"use client";

/* eslint-disable @next/next/no-img-element -- Crop preview uses local object URLs. */

import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";

type CropRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type DragMode = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type DragState = {
  crop: CropRect;
  mode: DragMode;
  rect: DOMRect;
  startX: number;
  startY: number;
};

type Props = {
  file: File;
  onApply: (file: File) => void;
  onCancel: () => void;
  open: boolean;
  previewUrl: string;
  titleEn?: string;
  titleZh?: string;
};

const MIN_CROP_SIZE = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function constrainCrop(crop: CropRect): CropRect {
  const width = clamp(crop.width, MIN_CROP_SIZE, 100);
  const height = clamp(crop.height, MIN_CROP_SIZE, 100);
  const x = clamp(crop.x, 0, 100 - width);
  const y = clamp(crop.y, 0, 100 - height);

  return { height, width, x, y };
}

function cropFileName(name: string, mimeType: string) {
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const base = name.replace(/\.[a-z0-9]+$/i, "") || "image";
  return `${base}-cropped.${ext}`;
}

async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = src;
  });
}

async function cropImageFile(file: File, previewUrl: string, crop: CropRect) {
  const image = await loadImage(previewUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sx = Math.round((crop.x / 100) * sourceWidth);
  const sy = Math.round((crop.y / 100) * sourceHeight);
  const sw = Math.max(1, Math.round((crop.width / 100) * sourceWidth));
  const sh = Math.max(1, Math.round((crop.height / 100) * sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  const mimeType = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Image crop failed"));
      },
      mimeType,
      mimeType === "image/jpeg" ? 0.95 : undefined,
    );
  });

  return new File([blob], cropFileName(file.name, mimeType), { type: mimeType });
}

export function ImageCropDialog({ file, onApply, onCancel, open, previewUrl, titleEn, titleZh }: Props) {
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [crop, setCrop] = useState<CropRect>({ height: 80, width: 80, x: 10, y: 10 });
  const [imageSize, setImageSize] = useState({ height: 0, width: 0 });
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cropSizeLabel = useMemo(() => {
    if (!imageSize.width || !imageSize.height) return "";
    const width = Math.round((crop.width / 100) * imageSize.width);
    const height = Math.round((crop.height / 100) * imageSize.height);
    return `${width} x ${height}`;
  }, [crop.height, crop.width, imageSize.height, imageSize.width]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      event.preventDefault();
      const dx = ((event.clientX - drag.startX) / drag.rect.width) * 100;
      const dy = ((event.clientY - drag.startY) / drag.rect.height) * 100;
      const next = { ...drag.crop };

      if (drag.mode === "move") {
        next.x += dx;
        next.y += dy;
      }
      if (drag.mode.includes("e")) next.width += dx;
      if (drag.mode.includes("s")) next.height += dy;
      if (drag.mode.includes("w")) {
        next.x += dx;
        next.width -= dx;
      }
      if (drag.mode.includes("n")) {
        next.y += dy;
        next.height -= dy;
      }

      setCrop(constrainCrop(next));
    }

    function handlePointerUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  if (!open) return null;

  function beginDrag(event: ReactPointerEvent, mode: DragMode) {
    const rect = imageBoxRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      crop,
      mode,
      rect,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  async function applyCrop() {
    setApplying(true);
    setError(null);
    try {
      onApply(await cropImageFile(file, previewUrl, crop));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : t("裁剪失败", "Crop failed"));
    } finally {
      setApplying(false);
    }
  }

  const handleClass = "absolute h-4 w-4 rounded-full border-2 border-white bg-cyan-400 shadow-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-5xl rounded-[24px] border p-5 shadow-2xl ${isDark ? "border-white/[0.1] bg-slate-950 text-slate-100" : "border-black/[0.06] bg-white text-slate-950"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t(titleZh ?? "裁剪原图", titleEn ?? "Crop Source Image")}</h2>
            <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {t("拖动裁剪框对准衣服印花区域，提交前会用裁剪后的图片上传给 AI。", "Drag the crop box over the garment print area. The cropped image will be sent to AI.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCrop({ height: 100, width: 100, x: 0, y: 0 })}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-white/[0.1] text-slate-300 hover:bg-white/[0.06]" : "border-black/[0.08] text-slate-700 hover:bg-black/[0.03]"}`}
            >
              {t("全图", "Full Image")}
            </button>
            <button
              type="button"
              onClick={() => setCrop({ height: 70, width: 70, x: 15, y: 15 })}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-white/[0.1] text-slate-300 hover:bg-white/[0.06]" : "border-black/[0.08] text-slate-700 hover:bg-black/[0.03]"}`}
            >
              {t("居中 70%", "Center 70%")}
            </button>
          </div>
        </div>

        <div className={`mt-5 flex max-h-[62vh] items-center justify-center overflow-auto rounded-2xl border p-4 ${isDark ? "border-white/[0.08] bg-slate-900/70" : "border-black/[0.06] bg-slate-50"}`}>
          <div ref={imageBoxRef} className="relative inline-block max-h-[58vh] max-w-full select-none">
            <img
              src={previewUrl}
              alt={file.name}
              draggable={false}
              onLoad={(event) => {
                setImageSize({ height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth });
                setCrop({ height: 80, width: 80, x: 10, y: 10 });
                setError(null);
              }}
              className="max-h-[58vh] max-w-full rounded-xl object-contain"
            />
            <div
              className="absolute cursor-move rounded-lg border-2 border-cyan-300 bg-cyan-300/10"
              onPointerDown={(event) => beginDrag(event, "move")}
              style={{
                boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.48)",
                height: `${crop.height}%`,
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
              }}
            >
              <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
                {cropSizeLabel || t("裁剪区域", "Crop Area")}
              </span>
              <span onPointerDown={(event) => beginDrag(event, "nw")} className={`${handleClass} -left-2 -top-2 cursor-nwse-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "n")} className={`${handleClass} left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "ne")} className={`${handleClass} -right-2 -top-2 cursor-nesw-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "e")} className={`${handleClass} -right-2 top-1/2 -translate-y-1/2 cursor-ew-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "se")} className={`${handleClass} -bottom-2 -right-2 cursor-nwse-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "s")} className={`${handleClass} -bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "sw")} className={`${handleClass} -bottom-2 -left-2 cursor-nesw-resize`} />
              <span onPointerDown={(event) => beginDrag(event, "w")} className={`${handleClass} -left-2 top-1/2 -translate-y-1/2 cursor-ew-resize`} />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${error ? "text-red-500" : isDark ? "text-slate-400" : "text-slate-500"}`}>
            {error || t("裁剪只影响本次 AI 上传，不会修改你本地原文件。", "Cropping only affects this AI upload and does not change the local file.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={applying}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${isDark ? "border-white/[0.1] text-slate-300 hover:bg-white/[0.06]" : "border-black/[0.08] text-slate-700 hover:bg-black/[0.03]"}`}
            >
              {t("取消", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void applyCrop()}
              disabled={applying}
              className={`rounded-xl bg-gradient-to-r ${colors.gradient} px-4 py-2 text-sm font-semibold text-white shadow-lg ${colors.shadow} transition hover:brightness-110 disabled:opacity-50`}
            >
              {applying ? t("裁剪中...", "Cropping...") : t("应用裁剪", "Apply Crop")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
