"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";

import { useSettings } from "@/lib/settings/context";

export type UploadAssetSource = "upload_original" | "print_transparent" | "garment_base";

type UploadResult = {
  asset_id?: string;
  error?: string;
  file_size: number;
  filename: string;
  format?: string;
  height?: number;
  original_url?: string;
  source?: string;
  success: boolean;
  width?: number;
};

type UploadResponse = {
  error?: string;
  failed_count?: number;
  results?: UploadResult[];
  success_count?: number;
};

type UploadFormProps = {
  assetSource?: UploadAssetSource;
  descriptionEn?: string;
  descriptionZh?: string;
  titleEn?: string;
  titleZh?: string;
};

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

const sourceLabels: Record<UploadAssetSource, { zh: string; en: string }> = {
  garment_base: { zh: "胚衣底图", en: "Blank Garment" },
  print_transparent: { zh: "透明印花图", en: "Transparent Print" },
  upload_original: { zh: "原图", en: "Original" },
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadForm({
  assetSource = "upload_original",
  descriptionEn,
  descriptionZh,
  titleEn,
  titleZh,
}: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { isDark, t } = useSettings();
  const sourceLabel = sourceLabels[assetSource];

  const unsupportedFiles = useMemo(
    () =>
      files.filter((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        return !ACCEPTED_MIME_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.has(extension);
      }),
    [files],
  );
  const successCount = results.filter((result) => result.success).length;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
    setMessage(null);
    setResults([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setMessage(t("请选择至少一张图片", "Please choose at least one image"));
      return;
    }

    setIsUploading(true);
    setMessage(null);
    setResults([]);

    const formData = new FormData();
    formData.append("asset_source", assetSource);
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/upload", {
        body: formData,
        method: "POST",
      });
      const data = (await response.json()) as UploadResponse;

      setResults(data.results ?? []);

      if (!response.ok && data.error) {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("上传失败", "Upload failed"));
    } finally {
      setIsUploading(false);
    }
  }

  function clearSelection() {
    setFiles([]);
    setMessage(null);
    setResults([]);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className={[
          "overflow-hidden rounded-2xl border shadow-sm",
          isDark
            ? "border-white/10 bg-white/[0.04] shadow-black/20"
            : "border-slate-200 bg-white shadow-slate-200/70",
        ].join(" ")}
      >
        <div
          className={[
            "flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5",
            isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/80",
          ].join(" ")}
        >
          <div>
            <span className="inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600">
              {t(sourceLabel.zh, sourceLabel.en)}
            </span>
            <h2 className={["mt-3 text-xl font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
              {t(titleZh ?? "本地上传", titleEn ?? "Local Upload")}
            </h2>
            <p className={["mt-1 text-sm leading-6", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
              {t(
                descriptionZh ?? "上传后会自动写入素材库，并带上当前入口的分类标签。",
                descriptionEn ?? "Uploaded files are saved to the asset library with the selected category tag.",
              )}
            </p>
          </div>
          <Link
            href="/assets"
            className={[
              "rounded-xl border px-4 py-2 text-sm font-bold transition",
              isDark
                ? "border-white/10 bg-white/[0.04] text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-400/10"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50",
            ].join(" ")}
          >
            {t("查看素材库", "View Assets")}
          </Link>
        </div>

        <div className="p-6">
          <div
            className={[
              "relative rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
              isDragging
                ? "border-emerald-400 bg-emerald-500/10"
                : isDark
                  ? "border-slate-600/70 bg-slate-950/20 hover:border-emerald-400/50"
                  : "border-slate-300 bg-slate-50/60 hover:border-emerald-300",
            ].join(" ")}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const dropped = Array.from(event.dataTransfer.files);
              if (dropped.length > 0) {
                setFiles(dropped);
                setResults([]);
                setMessage(null);
              }
            }}
          >
            <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className={["mt-4 text-base font-black", isDark ? "text-slate-100" : "text-slate-800"].join(" ")}>
              {isDragging ? t("松开鼠标上传文件", "Release to upload files") : t("拖拽图片到此处，或点击选择", "Drag images here, or click to choose")}
            </p>
            <p className={["mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
              {t("支持 jpg、jpeg、png、webp，可一次选择多张", "Supports jpg, jpeg, png, and webp. Multiple files can be selected.")}
            </p>
            <input
              id={`images-${assetSource}`}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>

          {files.length > 0 ? (
            <div className={["mt-5 rounded-xl border p-4", isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-slate-50"].join(" ")}>
              <div className="flex items-center justify-between gap-3">
                <p className={["text-sm font-bold", isDark ? "text-slate-100" : "text-slate-950"].join(" ")}>
                  {t(`已选择 ${files.length} 张图片`, `${files.length} image${files.length === 1 ? "" : "s"} selected`)}
                </p>
                <button
                  type="button"
                  onClick={clearSelection}
                  className={["text-sm font-bold", isDark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-slate-950"].join(" ")}
                >
                  {t("清空", "Clear")}
                </button>
              </div>
              <ul className={["mt-3 max-h-44 space-y-2 overflow-y-auto text-sm", isDark ? "text-slate-300" : "text-slate-600"].join(" ")}>
                {files.map((file) => (
                  <li key={`${file.name}-${file.lastModified}`} className="flex justify-between gap-4">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <span className="shrink-0 text-slate-500">{formatFileSize(file.size)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {unsupportedFiles.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t(
                `有 ${unsupportedFiles.length} 个文件格式可能不受支持，提交后会返回失败原因。`,
                `${unsupportedFiles.length} file${unsupportedFiles.length === 1 ? "" : "s"} may be unsupported. The server will return the reason after submission.`,
              )}
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isUploading || files.length === 0}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
            >
              {isUploading ? t("上传中...", "Uploading...") : t("开始上传", "Start Upload")}
            </button>
            <span className={["text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
              {t("系统会按当前入口自动打标。", "The selected category is applied automatically.")}
            </span>
          </div>
        </div>
      </form>

      {results.length > 0 ? (
        <section className={["overflow-hidden rounded-2xl border", isDark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white"].join(" ")}>
          <div className={["border-b px-6 py-4", isDark ? "border-white/10" : "border-slate-200"].join(" ")}>
            <h3 className={["text-base font-black", isDark ? "text-white" : "text-slate-950"].join(" ")}>
              {t("上传结果", "Upload Results")}
            </h3>
            <p className={["mt-1 text-sm", isDark ? "text-slate-400" : "text-slate-500"].join(" ")}>
              {t(`成功 ${successCount} 张，失败 ${results.length - successCount} 张`, `${successCount} succeeded, ${results.length - successCount} failed`)}
            </p>
          </div>
          <div className={["divide-y", isDark ? "divide-white/10" : "divide-slate-200"].join(" ")}>
            {results.map((result) => (
              <div
                key={`${result.filename}-${result.asset_id ?? result.error}`}
                className="grid gap-3 px-6 py-4 md:grid-cols-[1fr_120px_160px]"
              >
                <div className="min-w-0">
                  <p className={["truncate text-sm font-bold", isDark ? "text-slate-100" : "text-slate-950"].join(" ")}>
                    {result.filename}
                  </p>
                  {result.success && result.width && result.height ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {result.width} x {result.height} / {result.format} / {formatFileSize(result.file_size)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-red-600">{result.error}</p>
                  )}
                </div>
                <div>
                  <span
                    className={[
                      "inline-flex rounded-full px-3 py-1 text-xs font-black",
                      result.success
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-600",
                    ].join(" ")}
                  >
                    {result.success ? t("上传成功", "Uploaded") : t("上传失败", "Failed")}
                  </span>
                </div>
                {result.original_url ? (
                  <a
                    href={result.original_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-bold text-emerald-600 hover:text-emerald-500"
                  >
                    {t("查看原图", "View Original")}
                  </a>
                ) : (
                  <span className="text-sm text-slate-400">{t("无文件地址", "No file URL")}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
