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

type Point = {
  x: number;
  y: number;
};

type DragMode = "draw" | "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type DragState = {
  anchor?: Point;
  crop: CropRect | null;
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

const MIN_CROP_SIZE = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCrop(crop: CropRect): CropRect {
  const x1 = Math.min(crop.x, crop.x + crop.width);
  const y1 = Math.min(crop.y, crop.y + crop.height);
  const x2 = Math.max(crop.x, crop.x + crop.width);
  const y2 = Math.max(crop.y, crop.y + crop.height);
  const width = clamp(x2 - x1, MIN_CROP_SIZE, 100);
  const height = clamp(y2 - y1, MIN_CROP_SIZE, 100);
  const x = clamp(x1, 0, 100 - width);
  const y = clamp(y1, 0, 100 - height);

  return { height, width, x, y };
}

function cropFromPoints(start: Point, end: Point): CropRect {
  return normalizeCrop({
    height: end.y - start.y,
    width: end.x - start.x,
    x: start.x,
    y: start.y,
  });
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
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [imageSize, setImageSize] = useState({ height: 0, width: 0 });
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cropSizeLabel = useMemo(() => {
    if (!crop || !imageSize.width || !imageSize.height) return "";
    const width = Math.round((crop.width / 100) * imageSize.width);
    const height = Math.round((crop.height / 100) * imageSize.height);
    return `${width} x ${height}`;
  }, [crop, imageSize.height, imageSize.width]);

  useEffect(() => {
    function pointFromEvent(event: PointerEvent, rect: DOMRect): Point {
      return {
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      event.preventDefault();

      if (drag.mode === "draw" && drag.anchor) {
        setCrop(cropFromPoints(drag.anchor, pointFromEvent(event, drag.rect)));
        return;
      }

      if (!drag.crop) return;

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

      setCrop(normalizeCrop(next));
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

  function getPoint(event: ReactPointerEvent, rect: DOMRect): Point {
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function beginDraw(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    const rect = imageBoxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchor = getPoint(event, rect);
    event.preventDefault();
    setError(null);
    setCrop({ height: MIN_CROP_SIZE, width: MIN_CROP_SIZE, x: anchor.x, y: anchor.y });
    dragRef.current = {
      anchor,
      crop: null,
      mode: "draw",
      rect,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function beginDrag(event: ReactPointerEvent, mode: Exclude<DragMode, "draw">) {
    const rect = imageBoxRef.current?.getBoundingClientRect();
    if (!rect || !crop) return;
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
    if (!crop) {
      setError(t("请先按住鼠标左键拖拽框选印花区域。", "Drag on the image first to select the print area."));
      return;
    }

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

  const handleClass = "absolute h-4 w-4 rounded-[3px] border-2 border-white bg-emerald-400 shadow-lg";

  return (
    <div className="fixed inset-0 z-50 bg-black/65 p-4 backdrop-blur-sm">
      <div className={`mx-auto flex h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col overflow-hidden rounded-[26px] border shadow-2xl ${isDark ? "border-white/[0.1] bg-slate-950 text-slate-100" : "border-black/[0.06] bg-white text-slate-950"}`}>
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-black/5 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">{t(titleZh ?? "裁剪原图", titleEn ?? "Crop Source Image")}</h2>
            <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              {t("按住鼠标左键拖拽框选印花区域；框选后可移动或拉伸边角微调。", "Hold the left mouse button and drag to select the print area. Move or resize the box after selecting.")}
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
            <button
              type="button"
              onClick={() => {
                setCrop(null);
                setError(null);
              }}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${isDark ? "border-white/[0.1] text-slate-300 hover:bg-white/[0.06]" : "border-black/[0.08] text-slate-700 hover:bg-black/[0.03]"}`}
            >
              {t("重新框选", "Reselect")}
            </button>
          </div>
        </div>

        <div className={`min-h-0 flex-1 p-6 ${isDark ? "bg-slate-900/70" : "bg-slate-100"}`}>
          <div className={`flex h-full items-center justify-center overflow-auto rounded-2xl border p-4 ${isDark ? "border-white/[0.08] bg-slate-950/50" : "border-black/[0.06] bg-white"}`}>
            <div
              ref={imageBoxRef}
              onPointerDown={beginDraw}
              className="relative inline-block max-h-full max-w-full cursor-crosshair select-none"
            >
              <img
                src={previewUrl}
                alt={file.name}
                draggable={false}
                onLoad={(event) => {
                  setImageSize({ height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth });
                  setCrop(null);
                  setError(null);
                }}
                className="block max-h-[calc(100vh-220px)] max-w-full rounded-xl object-contain"
              />
              {crop ? (
                <div
                  className="absolute cursor-move border-2 border-emerald-400 bg-emerald-300/10"
                  onPointerDown={(event) => beginDrag(event, "move")}
                  style={{
                    boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.52)",
                    height: `${crop.height}%`,
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.width}%`,
                  }}
                >
                  <span className="absolute -top-8 left-0 whitespace-nowrap rounded-md bg-black/75 px-2 py-1 text-xs font-semibold text-white">
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
              ) : (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/20">
                  <span className="rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white">
                    {t("按住左键拖拽框选", "Drag to select")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/5 px-6 py-4">
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
