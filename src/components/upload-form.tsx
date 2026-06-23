"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";

import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

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

type InfringementCheckResponse = {
  checks?: Array<{ asset_id: string }>;
  error?: string;
  message?: string;
};

type InfringementCheckProgress = {
  completed: number;
  concurrency: number;
  failed: number;
  running: number;
  succeeded: number;
  total: number;
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
const INFRINGEMENT_CHECK_BATCH_SIZE = 10;
const INFRINGEMENT_CHECK_CONCURRENCY = 2;

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

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function readInfringementCheckResponse(response: Response): Promise<InfringementCheckResponse> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as InfringementCheckResponse;
  } catch {
    return { error: response.ok ? undefined : text.slice(0, 160) };
  }
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
  const [doneCount, setDoneCount] = useState(0);
  const [isCheckingInfringement, setIsCheckingInfringement] = useState(false);
  const [infringementMessage, setInfringementMessage] = useState<string | null>(null);
  const [infringementError, setInfringementError] = useState<string | null>(null);
  const [infringementProgress, setInfringementProgress] = useState<InfringementCheckProgress | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { isDark, t, accent } = useSettings();
  const colors = ACCENT_COLORS[accent] ?? ACCENT_COLORS.cyan;
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
  const uploadedAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          results
            .filter((result): result is UploadResult & { asset_id: string } => result.success && Boolean(result.asset_id))
            .map((result) => result.asset_id),
        ),
      ),
    [results],
  );
  const infringementProgressPercent = infringementProgress?.total
    ? Math.min(100, Math.round((infringementProgress.completed / infringementProgress.total) * 100))
    : 0;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
    setMessage(null);
    setResults([]);
    setInfringementMessage(null);
    setInfringementError(null);
    setInfringementProgress(null);
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
    setDoneCount(0);
    setInfringementMessage(null);
    setInfringementError(null);
    setInfringementProgress(null);

    // Limit concurrent uploads to avoid request and memory spikes on large batches.
    const CONCURRENCY = 5;
    const queue = [...files];
    const collected: UploadResult[] = [];

    async function uploadWorker() {
      for (;;) {
        const file = queue.shift();
        if (!file) return;

        try {
          const formData = new FormData();
          formData.append("asset_source", assetSource);
          formData.append("files", file);
          const response = await fetch("/api/upload", { body: formData, method: "POST" });
          const data = (await response.json()) as UploadResponse;
          collected.push(
            data.results?.[0] ?? {
              error: data.error ?? t("上传失败", "Upload failed"),
              file_size: file.size,
              filename: file.name,
              success: false,
            },
          );
        } catch (error) {
          collected.push({
            error: error instanceof Error ? error.message : t("上传失败", "Upload failed"),
            file_size: file.size,
            filename: file.name,
            success: false,
          });
        } finally {
          setDoneCount((count) => count + 1);
          setResults([...collected]);
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => uploadWorker()));
    } finally {
      setIsUploading(false);
    }
  }

  function clearSelection() {
    setFiles([]);
    setMessage(null);
    setResults([]);
    setInfringementMessage(null);
    setInfringementError(null);
    setInfringementProgress(null);
  }

  async function runInfringementCheckForUploads() {
    if (uploadedAssetIds.length === 0) {
      setInfringementError(t("没有可检测的上传成功图片", "No successfully uploaded images to check"));
      return;
    }

    setIsCheckingInfringement(true);
    setInfringementError(null);
    setInfringementMessage(
      t(
        `正在检测 ${uploadedAssetIds.length} 张图片，分批并发处理中...`,
        `Checking ${uploadedAssetIds.length} image(s) in concurrent batches...`,
      ),
    );

    const batches = chunkArray(uploadedAssetIds, INFRINGEMENT_CHECK_BATCH_SIZE);
    const concurrency = Math.min(INFRINGEMENT_CHECK_CONCURRENCY, batches.length);
    let nextBatchIndex = 0;
    let succeededCount = 0;
    let failedCount = 0;
    let firstError: string | null = null;

    setInfringementProgress({
      completed: 0,
      concurrency,
      failed: 0,
      running: 0,
      succeeded: 0,
      total: uploadedAssetIds.length,
    });

    try {
      async function checkWorker() {
        for (;;) {
          const batchIndex = nextBatchIndex;
          nextBatchIndex += 1;
          const batch = batches[batchIndex];

          if (!batch) return;

          setInfringementProgress((progress) =>
            progress ? { ...progress, running: progress.running + 1 } : progress,
          );

          try {
            const response = await fetch("/api/infringement-checks", {
              body: JSON.stringify({ asset_ids: batch }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            });
            const data = await readInfringementCheckResponse(response);

            if (!response.ok) {
              throw new Error(
                data.error ??
                  t(`第 ${batchIndex + 1} 批检测失败`, `Batch ${batchIndex + 1} failed`) +
                    ` (${response.status})`,
              );
            }

            const checkedCount = data.checks?.length ?? batch.length;
            succeededCount += checkedCount;
            setInfringementProgress((progress) =>
              progress
                ? {
                    ...progress,
                    completed: progress.completed + batch.length,
                    running: Math.max(0, progress.running - 1),
                    succeeded: progress.succeeded + checkedCount,
                  }
                : progress,
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : t("侵权检测失败", "Infringement check failed");
            firstError ??= message;
            failedCount += batch.length;
            setInfringementProgress((progress) =>
              progress
                ? {
                    ...progress,
                    completed: progress.completed + batch.length,
                    failed: progress.failed + batch.length,
                    running: Math.max(0, progress.running - 1),
                  }
                : progress,
            );
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => checkWorker()));

      if (failedCount > 0) {
        setInfringementMessage(
          succeededCount > 0
            ? t(`已完成 ${succeededCount} 张图片的侵权检测`, `Checked ${succeededCount} image(s)`)
            : null,
        );
        setInfringementError(
          t(
            `有 ${failedCount} 张图片检测失败。${firstError ?? "请稍后重试"}`,
            `${failedCount} image(s) failed to check. ${firstError ?? "Please try again later"}`,
          ),
        );
      } else {
        setInfringementMessage(t(`已完成 ${succeededCount} 张图片的侵权检测`, `Checked ${succeededCount} image(s)`));
      }
    } catch (error) {
      setInfringementMessage(null);
      setInfringementError(error instanceof Error ? error.message : t("侵权检测失败", "Infringement check failed"));
    } finally {
      setIsCheckingInfringement(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className={[
          "overflow-hidden rounded-[10px] border",
          isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-black/[0.08] bg-white",
        ].join(" ")}
      >
        <div
          className={[
            "flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5",
            isDark ? "border-white/[0.08]" : "border-black/[0.08]",
          ].join(" ")}
        >
          <div>
            <span
              className={[
                "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                isDark ? "border-white/[0.12] bg-white/[0.04]" : "border-black/[0.12] bg-black/[0.03]",
              ].join(" ")}
              style={{ color: colors.primary }}
            >
              {t(sourceLabel.zh, sourceLabel.en)}
            </span>
            <h2 className={["mt-3 text-lg font-semibold tracking-tight", isDark ? "text-white" : "text-zinc-900"].join(" ")}>
              {t(titleZh ?? "本地上传", titleEn ?? "Local Upload")}
            </h2>
            <p className={["mt-1 text-[13px] leading-relaxed", isDark ? "text-zinc-500" : "text-zinc-500"].join(" ")}>
              {t(
                descriptionZh ?? "上传后会自动写入素材库，并带上当前入口的分类标签。",
                descriptionEn ?? "Uploaded files are saved to the asset library with the selected category tag.",
              )}
            </p>
          </div>
          <Link
            href="/assets"
            className={[
              "rounded-md border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
              isDark
                ? "border-white/[0.12] bg-white/[0.04] text-zinc-200 hover:border-white/[0.24] hover:bg-white/[0.08]"
                : "border-black/[0.12] bg-white text-zinc-700 hover:border-black/[0.24] hover:bg-black/[0.03]",
            ].join(" ")}
          >
            {t("查看素材库", "View Assets")}
          </Link>
        </div>

        <div className="p-6">
          <div
            className={[
              "relative rounded-[10px] border border-dashed p-10 text-center transition-colors duration-150",
              isDragging
                ? ""
                : isDark
                  ? "border-white/[0.16] bg-white/[0.02] hover:border-white/[0.28]"
                  : "border-black/[0.16] bg-black/[0.02] hover:border-black/[0.28]",
            ].join(" ")}
            style={
              isDragging
                ? { borderColor: colors.primary, backgroundColor: `${colors.primary}14` }
                : undefined
            }
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
                setInfringementMessage(null);
                setInfringementError(null);
                setInfringementProgress(null);
              }
            }}
          >
            <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className={["mt-4 text-sm font-medium", isDark ? "text-zinc-200" : "text-zinc-800"].join(" ")}>
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
            <div className={["mt-5 rounded-[10px] border p-4", isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.08] bg-black/[0.02]"].join(" ")}>
              <div className="flex items-center justify-between gap-3">
                <p className={["text-[13px] font-medium", isDark ? "text-zinc-200" : "text-zinc-900"].join(" ")}>
                  {t(`已选择 ${files.length} 张图片`, `${files.length} image${files.length === 1 ? "" : "s"} selected`)}
                </p>
                <button
                  type="button"
                  onClick={clearSelection}
                  className={["text-[13px] font-medium", isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"].join(" ")}
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
            <div className="ui-enter mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t(
                `有 ${unsupportedFiles.length} 个文件格式可能不受支持，提交后会返回失败原因。`,
                `${unsupportedFiles.length} file${unsupportedFiles.length === 1 ? "" : "s"} may be unsupported. The server will return the reason after submission.`,
              )}
            </div>
          ) : null}

          {message ? (
            <div className="ui-enter mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          {isUploading && files.length > 0 ? (
            <div className="mt-4">
              <div className={["flex items-center justify-between text-[13px]", isDark ? "text-zinc-300" : "text-zinc-600"].join(" ")}>
                <span>{t(`上传中 ${doneCount}/${files.length}`, `Uploading ${doneCount}/${files.length}`)}</span>
                <span>{Math.round((doneCount / files.length) * 100)}%</span>
              </div>
              <div className={["mt-2 h-2 w-full overflow-hidden rounded-full", isDark ? "bg-white/[0.08]" : "bg-black/[0.08]"].join(" ")}>
                <div
                  className="ui-progress-fill h-full rounded-full"
                  style={{ width: `${(doneCount / files.length) * 100}%`, backgroundColor: colors.primary }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isUploading || files.length === 0}
              className="ui-press rounded-md px-4 py-2 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: colors.primary }}
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
        <section className={["ui-enter overflow-hidden rounded-[10px] border", isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-black/[0.08] bg-white"].join(" ")}>
          <div className={["border-b px-6 py-4", isDark ? "border-white/[0.08]" : "border-black/[0.08]"].join(" ")}>
            <h3 className={["text-sm font-semibold", isDark ? "text-white" : "text-zinc-900"].join(" ")}>
              {t("上传结果", "Upload Results")}
            </h3>
            <p className={["mt-1 text-[13px]", isDark ? "text-zinc-500" : "text-zinc-500"].join(" ")}>
              {t(`成功 ${successCount} 张，失败 ${results.length - successCount} 张`, `${successCount} succeeded, ${results.length - successCount} failed`)}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runInfringementCheckForUploads()}
                disabled={isCheckingInfringement || uploadedAssetIds.length === 0}
                className={[
                  "ui-press rounded-md px-3.5 py-2 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40",
                ].join(" ")}
                style={{ backgroundColor: colors.primary }}
              >
                {isCheckingInfringement
                  ? infringementProgress
                    ? t(`检测中 ${infringementProgress.completed}/${infringementProgress.total}`, `Checking ${infringementProgress.completed}/${infringementProgress.total}`)
                    : t("检测中...", "Checking...")
                  : t(`一键侵权检测 ${uploadedAssetIds.length} 张`, `Check ${uploadedAssetIds.length} uploaded`)}
              </button>
              <Link
                href="/infringement-check"
                className={[
                  "ui-press rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors duration-150",
                  isDark
                    ? "border-white/[0.12] bg-white/[0.04] text-zinc-200 hover:border-white/[0.24] hover:bg-white/[0.08]"
                    : "border-black/[0.12] bg-white text-zinc-700 hover:border-black/[0.24] hover:bg-black/[0.03]",
                ].join(" ")}
              >
                {t("查看检测结果", "View Checks")}
              </Link>
            </div>
            {infringementProgress ? (
              <div className={["mt-4 rounded-md border p-3", isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.08] bg-black/[0.02]"].join(" ")}>
                <div className={["flex items-center justify-between gap-3 text-[13px]", isDark ? "text-zinc-300" : "text-zinc-600"].join(" ")}>
                  <span>
                    {t(
                      `检测进度 ${infringementProgress.completed}/${infringementProgress.total}`,
                      `Check progress ${infringementProgress.completed}/${infringementProgress.total}`,
                    )}
                  </span>
                  <span>{infringementProgressPercent}%</span>
                </div>
                <div
                  className={["mt-2 h-2 w-full overflow-hidden rounded-full", isDark ? "bg-white/[0.08]" : "bg-black/[0.08]"].join(" ")}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={infringementProgressPercent}
                >
                  <div
                    className="ui-progress-fill h-full rounded-full"
                    style={{ width: `${infringementProgressPercent}%`, backgroundColor: colors.primary }}
                  />
                </div>
                <div className={["mt-2 grid gap-2 text-xs sm:grid-cols-4", isDark ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                  <span>{t(`成功 ${infringementProgress.succeeded}`, `Succeeded ${infringementProgress.succeeded}`)}</span>
                  <span>{t(`失败 ${infringementProgress.failed}`, `Failed ${infringementProgress.failed}`)}</span>
                  <span>{t(`运行中 ${infringementProgress.running}`, `Running ${infringementProgress.running}`)}</span>
                  <span>{t(`并发 ${infringementProgress.concurrency}`, `Concurrency ${infringementProgress.concurrency}`)}</span>
                </div>
              </div>
            ) : null}
            {infringementMessage ? (
              <div className="ui-enter mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-700">
                {infringementMessage}
              </div>
            ) : null}
            {infringementError ? (
              <div className="ui-enter mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
                {infringementError}
              </div>
            ) : null}
          </div>
          <div className={["divide-y", isDark ? "divide-white/[0.08]" : "divide-black/[0.08]"].join(" ")}>
            {results.map((result) => (
              <div
                key={`${result.filename}-${result.asset_id ?? result.error}`}
                className="ui-enter grid gap-3 px-6 py-4 md:grid-cols-[1fr_120px_160px]"
              >
                <div className="min-w-0">
                  <p className={["truncate text-[13px] font-medium", isDark ? "text-zinc-200" : "text-zinc-900"].join(" ")}>
                    {result.filename}
                  </p>
                  {result.success && result.width && result.height ? (
                    <p className="mt-1 font-mono text-xs text-zinc-500">
                      {result.width} x {result.height} / {result.format} / {formatFileSize(result.file_size)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-red-500">{result.error}</p>
                  )}
                </div>
                <div>
                  <span
                    className={[
                      "ui-status-pop inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                      result.success
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-red-500/10 text-red-500",
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
                    className="text-[13px] font-medium transition-opacity hover:opacity-80"
                    style={{ color: colors.primary }}
                  >
                    {t("查看原图", "View Original")}
                  </a>
                ) : (
                  <span className="text-[13px] text-zinc-500">{t("无文件地址", "No file URL")}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
