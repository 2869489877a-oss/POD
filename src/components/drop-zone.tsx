"use client";

/* eslint-disable @next/next/no-img-element -- Upload previews use local object URLs. */

import { type DragEvent, useRef, useState } from "react";
import { useSettings } from "@/lib/settings/context";

type Props = {
  label?: string;
  hint?: string;
  accept?: string;
  file: File | null;
  preview?: string | null;
  onFileChange: (file: File | null) => void;
};

export function DropZone({ label, hint, accept = "image/*", file, preview, onFileChange }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { isDark, t } = useSettings();

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onFileChange(f);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={`ui-drop-zone relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center ${dragging ? `ui-drop-zone-active ${isDark ? "border-blue-400 bg-blue-500/10" : "border-blue-400 bg-blue-50"}` : (isDark ? "border-white/10 bg-slate-800/30 hover:border-white/20" : "border-slate-300 bg-slate-50 hover:border-slate-400")}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {file && preview ? (
        <div className="relative z-10 space-y-2">
          <img src={preview} alt="preview" className="mx-auto max-h-32 rounded-lg object-contain" />
          <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{file.name}</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
            className="text-xs text-red-500 hover:text-red-600"
          >
            {t("移除", "Remove")}
          </button>
        </div>
      ) : (
        <div className="relative z-10 space-y-1">
          <svg className={`ui-drop-icon mx-auto h-8 w-8 ${isDark ? "text-slate-500" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>{label || t("拖拽图片到此处，或点击选择", "Drag an image here, or click to choose")}</p>
          {hint && <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{hint}</p>}
        </div>
      )}
    </div>
  );
}
