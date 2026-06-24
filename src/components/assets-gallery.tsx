"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { getDisplayImageSrc } from "@/lib/local-asset-url";

import { fetchAssetsAction } from "@/lib/actions/assets";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";
import {
  resizePresets,
  type ResizePresetKey,
} from "@/lib/image-processing/resize-presets";

type AssetStatus = "uploaded" | "processing" | "processed" | "failed";
type CopyrightStatus = "unknown" | "owned" | "commercial_ok" | "risky" | "forbidden";
type AssetSourceFilter =
  | "all"
  | "local_original"
  | "print_transparent"
  | "garment_base"
  | "ai"
  | "link"
  | "other";

export type Asset = {
  copyright_status: CopyrightStatus;
  cutout_url: string | null;
  created_at: string;
  file_size: number;
  filename: string;
  format: string;
  height: number;
  id: string;
  original_url: string;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
  source: string;
  status: AssetStatus;
  updated_at: string;
  width: number;
};

type DeleteAssetsResponse = {
  error?: string;
  failed_count?: number;
  job_id?: string;
  message?: string;
  queued?: boolean;
  requires_confirmation?: boolean;
  results?: Array<{
    asset_id: string;
    error?: string;
    filename?: string;
    success: boolean;
  }>;
  success_count?: number;
  usage?: Array<{
    asset_id: string;
    image_job_item_count: number;
    mockup_output_count: number;
    product_draft_count: number;
    used: boolean;
  }>;
};

type WorkerStatusResponse = {
  blocked_job_types?: string[];
  error?: string;
  missing_job_types?: string[];
  online?: boolean;
  ready?: boolean;
};

type ResizeJobStatus = "pending" | "processing" | "completed" | "failed" | "partial_failed";

type ResizeJobProgress = {
  failed_count: number;
  id: string;
  items: Array<{
    asset_id: string;
    error_message: string | null;
    id: string;
    input_url: string;
    output_url: string | null;
    status: "pending" | "processing" | "completed" | "failed";
  }>;
  status: ResizeJobStatus;
  success_count: number;
  total_count: number;
};

type ResizeJobResponse = {
  error?: string;
  job?: ResizeJobProgress;
};

type CreateResizeJobResponse = {
  error?: string;
  job?: {
    failed_count: number;
    id: string;
    status: ResizeJobStatus;
    success_count: number;
    total_count: number;
  };
};

type AssetsGalleryProps = {
  initialAssets: Asset[];
  initialError?: string | null;
};

const statusOptions: Array<{ zh: string; en: string; value: "all" | AssetStatus }> = [
  { zh: "全部状态", en: "All Statuses", value: "all" },
  { zh: "已上传", en: "Uploaded", value: "uploaded" },
  { zh: "处理中", en: "Processing", value: "processing" },
  { zh: "已处理", en: "Processed", value: "processed" },
  { zh: "失败", en: "Failed", value: "failed" },
];

const copyrightOptions: Array<{ zh: string; en: string; value: "all" | CopyrightStatus }> = [
  { zh: "全部版权", en: "All Copyright", value: "all" },
  { zh: "未知", en: "Unknown", value: "unknown" },
  { zh: "自有", en: "Owned", value: "owned" },
  { zh: "可商用", en: "Commercial OK", value: "commercial_ok" },
  { zh: "有风险", en: "Risky", value: "risky" },
  { zh: "禁用", en: "Forbidden", value: "forbidden" },
];

const sourceOptions: Array<{ zh: string; en: string; value: AssetSourceFilter }> = [
  { zh: "全部分类", en: "All Categories", value: "all" },
  { zh: "原图", en: "Originals", value: "local_original" },
  { zh: "透明印花图", en: "Transparent Prints", value: "print_transparent" },
  { zh: "胚衣底图", en: "Blank Garments", value: "garment_base" },
  { zh: "AI 生成", en: "AI Generated", value: "ai" },
  { zh: "其他", en: "Other", value: "other" },
];

const statusLabels: Record<AssetStatus, { zh: string; en: string }> = {
  failed: { zh: "失败", en: "Failed" },
  processed: { zh: "已处理", en: "Processed" },
  processing: { zh: "处理中", en: "Processing" },
  uploaded: { zh: "已上传", en: "Uploaded" },
};

const copyrightLabels: Record<CopyrightStatus, { zh: string; en: string }> = {
  commercial_ok: { zh: "可商用", en: "Commercial OK" },
  forbidden: { zh: "禁用", en: "Forbidden" },
  owned: { zh: "自有", en: "Owned" },
  risky: { zh: "有风险", en: "Risky" },
  unknown: { zh: "未知", en: "Unknown" },
};

const sourceLabels: Record<string, { zh: string; en: string }> = {
  ai: { zh: "AI 生成", en: "AI Generated" },
  garment_base: { zh: "胚衣底图", en: "Blank Garment" },
  link: { zh: "外部导入", en: "External Import" },
  other: { zh: "其他", en: "Other" },
  print_transparent: { zh: "透明印花图", en: "Transparent Print" },
  upload: { zh: "原图", en: "Original" },
  upload_original: { zh: "原图", en: "Original" },
};

const sourceStyles: Record<string, string> = {
  ai: "bg-violet-50 text-violet-700",
  garment_base: "bg-amber-50 text-amber-700",
  link: "bg-slate-100 text-slate-700",
  other: "bg-zinc-100 text-zinc-700",
  print_transparent: "bg-emerald-50 text-emerald-700",
  upload: "bg-sky-50 text-sky-700",
  upload_original: "bg-sky-50 text-sky-700",
};

const statusStyles: Record<AssetStatus, string> = {
  failed: "bg-red-50 text-red-700",
  processed: "bg-emerald-50 text-emerald-700",
  processing: "bg-amber-50 text-amber-700",
  uploaded: "bg-sky-50 text-sky-700",
};

const resizePresetOptions: ResizePresetKey[] = ["tshirt-print", "square-product"];

const resizeJobStatusLabels: Record<ResizeJobStatus, { zh: string; en: string }> = {
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  partial_failed: { zh: "部分失败", en: "Partial Failed" },
  pending: { zh: "等待处理", en: "Pending" },
  processing: { zh: "处理中", en: "Processing" },
};

const RESIZE_POLL_INTERVAL_MS = 1000;
const RESIZE_MAX_POLLS = 600;
const TERMINAL_RESIZE_STATUSES = new Set<ResizeJobStatus>(["completed", "failed", "partial_failed"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AssetsGallery({ initialAssets, initialError = null }: AssetsGalleryProps) {
  const { isDark, language, t } = useSettings();
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [status, setStatus] = useState<"all" | AssetStatus>("all");
  const [copyrightStatus, setCopyrightStatus] = useState<"all" | CopyrightStatus>("all");
  const [assetSource, setAssetSource] = useState<AssetSourceFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialAssets.length);
  const [isResizeDialogOpen, setIsResizeDialogOpen] = useState(false);
  const [resizePresetKey, setResizePresetKey] = useState<ResizePresetKey>("tshirt-print");
  const [resizeJob, setResizeJob] = useState<ResizeJobProgress | null>(null);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [resizeMessage, setResizeMessage] = useState<string | null>(null);
  const [isResizeRunning, setIsResizeRunning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingAssetIds, setDeletingAssetIds] = useState<Set<string>>(new Set());
  const [deletePhase, setDeletePhase] = useState<"checking" | "deleting" | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const preloadedImageUrls = useRef<Set<string>>(new Set());
  const selectedCount = selectedIds.size;
  const totalPages = Math.ceil(total / 24);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds],
  );
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );
  const resizeCompletedCount = resizeJob
    ? resizeJob.success_count + resizeJob.failed_count
    : 0;
  const resizeProgressPercent =
    resizeJob && resizeJob.total_count > 0
      ? Math.round((resizeCompletedCount / resizeJob.total_count) * 100)
      : 0;
  const failedResizeItems = resizeJob?.items.filter((item) => item.status === "failed") ?? [];
  const detailOverlayClass = isDark ? "bg-black/75" : "bg-zinc-950/60";
  const detailPanelClass = isDark
    ? "border border-white/[0.08] bg-[#0f0f10] text-zinc-100 shadow-2xl shadow-black/50"
    : "bg-white text-zinc-950 shadow-xl";
  const detailHeaderClass = isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-zinc-200 bg-white";
  const detailImageFrameClass = isDark ? "bg-black/40 ring-1 ring-white/[0.08]" : "bg-zinc-100";
  const detailTitleClass = isDark ? "text-white" : "text-zinc-950";
  const detailMutedClass = isDark ? "text-zinc-400" : "text-zinc-500";
  const detailValueClass = isDark ? "text-zinc-100" : "text-zinc-950";
  const detailButtonClass = isDark
    ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]"
    : "border-zinc-300 text-zinc-800 hover:bg-zinc-100";
  const detailLinkClass = isDark ? "text-cyan-300 hover:text-cyan-200" : "text-emerald-700 hover:text-emerald-800";
  const detailDangerButtonClass = isDark
    ? "border-red-400/40 text-red-300 hover:bg-red-500/10 disabled:border-white/[0.08] disabled:text-zinc-600"
    : "border-red-300 text-red-700 hover:bg-red-50 disabled:border-zinc-200 disabled:text-zinc-400";
  const showInitialLoading = isLoading && assets.length === 0;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedAsset) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAssetDetail();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedAsset]);

  async function fetchAssets(
    nextStatus: "all" | AssetStatus = status,
    nextCopyrightStatus: "all" | CopyrightStatus = copyrightStatus,
    nextSource: AssetSourceFilter = assetSource,
    nextPage: number = page,
  ) {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchAssetsAction(nextStatus, nextCopyrightStatus, nextSource, nextPage);

      if (data.error) {
        throw new Error(data.error);
      }

      const nextAssets = data.assets as Asset[];
      setAssets(nextAssets);
      setTotal(data.total);
      setSelectedIds((current) => {
        const visibleIds = new Set(nextAssets.map((asset) => asset.id));
        return new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取素材失败", "Failed to load assets"));
      setAssets([]);
      setSelectedIds(new Set());
    } finally {
      setIsLoading(false);
    }
  }

  function handleStatusChange(nextStatus: "all" | AssetStatus) {
    setStatus(nextStatus);
    setPage(1);
    void fetchAssets(nextStatus, copyrightStatus, assetSource, 1);
  }

  function handleCopyrightStatusChange(nextCopyrightStatus: "all" | CopyrightStatus) {
    setCopyrightStatus(nextCopyrightStatus);
    setPage(1);
    void fetchAssets(status, nextCopyrightStatus, assetSource, 1);
  }

  function handleAssetSourceChange(nextSource: AssetSourceFilter) {
    setAssetSource(nextSource);
    setPage(1);
    void fetchAssets(status, copyrightStatus, nextSource, 1);
  }

  function toggleAsset(assetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }

      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (assets.length > 0 && assets.every((asset) => current.has(asset.id))) {
        return new Set();
      }

      return new Set(assets.map((asset) => asset.id));
    });
  }

  async function deleteAssetIds(assetIds: string[]) {
    if (assetIds.length === 0) {
      setError(t("请选择要删除的素材", "Please select assets to delete"));
      return;
    }

    const confirmed = window.confirm(t(`确认删除 ${assetIds.length} 张素材？`, `Delete ${assetIds.length} asset(s)?`));
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setDeletingAssetIds(new Set(assetIds));
    setDeletePhase("deleting");
    setError(null);
    setDeleteMessage(null);

    try {
      let response = await fetch("/api/assets", {
        body: JSON.stringify({
          asset_ids: assetIds,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      let data = (await response.json()) as DeleteAssetsResponse;

      if (response.status === 409 && data.requires_confirmation) {
        const forceConfirmed = window.confirm(
          t("该素材已被任务、套图或商品草稿引用，删除会同时清理关联记录。是否继续？", "Some assets are used by jobs, mockups, or product drafts. Deleting will also clean related records. Continue?"),
        );

        if (!forceConfirmed) {
          return;
        }

        response = await fetch("/api/assets", {
          body: JSON.stringify({
            asset_ids: assetIds,
            force: true,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "DELETE",
        });
        data = (await response.json()) as DeleteAssetsResponse;
      }

      const failedResults = (data.results ?? []).filter((result) => !result.success);
      const successfulIds = new Set((data.results ?? []).filter((result) => result.success).map((result) => result.asset_id));

      if (!response.ok && (data.results ?? []).length === 0) {
        throw new Error(data.error ?? t("删除素材失败", "Failed to delete assets"));
      }

      setDeleteMessage(t(`删除成功 ${data.success_count ?? 0} 张，失败 ${data.failed_count ?? 0} 张`, `${data.success_count ?? 0} deleted, ${data.failed_count ?? 0} failed`));

      if (data.queued) {
        setDeleteMessage(
          t(
            `已加入后台删除队列：${data.success_count ?? assetIds.length} 张，任务 ${data.job_id ?? ""}`,
            `Queued ${data.success_count ?? assetIds.length} asset(s) for background deletion. Job ${data.job_id ?? ""}`,
          ),
        );
      }

      if (failedResults.length > 0) {
        setError(failedResults.map((result) => `${result.filename ?? result.asset_id}: ${result.error ?? t("删除失败", "Delete failed")}`).join("\n"));
      }

      if (successfulIds.size > 0) {
        setAssets((current) => current.filter((asset) => !successfulIds.has(asset.id)));
        setTotal((current) => Math.max(0, current - successfulIds.size));
      }

      setSelectedIds((current) => {
        return new Set(Array.from(current).filter((id) => !successfulIds.has(id)));
      });

      if (selectedAssetId && successfulIds.has(selectedAssetId)) {
        setSelectedAssetId(null);
      }

      if (!data.queued) {
        await fetchAssets(status, copyrightStatus, assetSource);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("删除素材失败", "Failed to delete assets"));
    } finally {
      setIsDeleting(false);
      setDeletingAssetIds(new Set());
      setDeletePhase(null);
    }
  }

  function preloadAssetImage(asset: Asset) {
    const previewUrl = getDisplayImageSrc(getAssetPreviewUrl(asset));
    if (preloadedImageUrls.current.has(previewUrl)) return;

    preloadedImageUrls.current.add(previewUrl);
    const image = new window.Image();
    image.decoding = "async";
    image.src = previewUrl;
  }

  function openAssetDetail(assetId: string) {
    const asset = assets.find((item) => item.id === assetId);
    if (asset) preloadAssetImage(asset);
    setSelectedAssetId(assetId);
  }

  function closeAssetDetail() {
    setSelectedAssetId(null);
  }

  function getAssetPreviewUrl(asset: Asset) {
    return (
      asset.preferred_design_url ??
      asset.print_extract_url ??
      asset.cutout_url ??
      asset.processed_url ??
      asset.original_url
    );
  }

  function getAssetDownloadUrl(asset: Asset) {
    return getAssetPreviewUrl(asset);
  }

  function getAssetSourceLabel(asset: Asset) {
    return sourceLabels[asset.source] ?? { zh: asset.source || "未分类", en: asset.source || "Uncategorized" };
  }

  async function downloadAsset(asset: Asset) {
    const url = getAssetDownloadUrl(asset);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(response.statusText || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = asset.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = url;
      link.download = asset.filename;
      link.target = "_blank";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  async function fetchResizeJob(jobId: string) {
    const response = await fetch(`/api/image-jobs/${jobId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as ResizeJobResponse;

    if (!response.ok || !data.job) {
      throw new Error(data.error ?? t("读取任务进度失败", "Failed to load job progress"));
    }

    return data.job;
  }

  async function ensureResizeWorkerReady() {
    try {
      const response = await fetch("/api/local-worker/status", { cache: "no-store" });
      const data = (await response.json()) as WorkerStatusResponse;

      if (!response.ok) {
        return t("无法读取 worker 状态，任务仍会进入队列。", "Could not read worker status. The job will still be queued.");
      }

      if (data.online === false) {
        throw new Error(t("本地 worker 未在线，请先启动 pod-ai-worker。", "Local worker is offline. Start pod-ai-worker first."));
      }

      if (data.missing_job_types?.includes("resize") || data.blocked_job_types?.includes("resize")) {
        throw new Error(t("本地 worker 当前没有启用 resize 任务类型，请检查 LOCAL_IMAGE_WORKER_JOB_TYPES。", "Local worker does not have resize enabled. Check LOCAL_IMAGE_WORKER_JOB_TYPES."));
      }
    } catch (workerError) {
      if (
        workerError instanceof Error
        && (workerError.message.includes("pod-ai-worker") || workerError.message.includes("LOCAL_IMAGE_WORKER_JOB_TYPES"))
      ) {
        throw workerError;
      }

      return t("暂时无法读取 worker 状态，任务仍会进入队列。", "Could not read worker status. The job will still be queued.");
    }

    return null;
  }

  async function startResizeJob() {
    const assetIds = Array.from(selectedIds);

    if (assetIds.length === 0) {
      setResizeError(t("请先选择要处理的图片", "Please select images to process"));
      return;
    }

    setIsResizeRunning(true);
    setResizeError(null);
    setResizeMessage(t("正在创建批量改尺寸任务...", "Creating batch resize job..."));
    setResizeJob(null);

    try {
      const workerWarning = await ensureResizeWorkerReady();
      if (workerWarning) {
        setResizeMessage(workerWarning);
      }

      const createResponse = await fetch("/api/image-jobs/resize", {
        body: JSON.stringify({
          asset_ids: assetIds,
          preset_key: resizePresetKey,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const createData = (await createResponse.json()) as CreateResizeJobResponse;

      if (!createResponse.ok || !createData.job) {
        throw new Error(createData.error ?? t("任务创建失败", "Failed to create job"));
      }

      const jobId = createData.job.id;
      setResizeJob({
        ...createData.job,
        items: [],
      });
      setResizeMessage(t(`任务已创建：${jobId}，等待本地 worker 处理图片...`, `Job created: ${jobId}. Waiting for the local worker...`));
      setIsResizeDialogOpen(false);

      for (let attempt = 0; attempt < RESIZE_MAX_POLLS; attempt += 1) {
        await sleep(RESIZE_POLL_INTERVAL_MS);

        const job = await fetchResizeJob(jobId);
        const completedCount = job.success_count + job.failed_count;
        const processingCount = job.items.filter((item) => item.status === "processing").length;
        const pendingCount = job.items.filter((item) => item.status === "pending").length;
        const percent = job.total_count > 0 ? Math.min(100, Math.round((completedCount / job.total_count) * 100)) : 0;

        setResizeJob(job);
        setResizeMessage(
          TERMINAL_RESIZE_STATUSES.has(job.status)
            ? t(`批量改尺寸任务处理完成：${completedCount}/${job.total_count}`, `Batch resize job complete: ${completedCount}/${job.total_count}`)
            : processingCount > 0
              ? t(`本地 worker 处理中：完成 ${completedCount}/${job.total_count}，运行中 ${processingCount}，${percent}%`, `Local worker processing: done ${completedCount}/${job.total_count}, running ${processingCount}, ${percent}%`)
              : attempt >= 15 && completedCount === 0
                ? t(`任务已排队但 worker 暂未领取：待处理 ${pendingCount}/${job.total_count}。请检查 pod-ai-worker 日志。`, `Job is queued but worker has not claimed it yet: pending ${pendingCount}/${job.total_count}. Check pod-ai-worker logs.`)
                : t(`任务已排队：待处理 ${pendingCount}/${job.total_count}，等待 worker 领取...`, `Job queued: pending ${pendingCount}/${job.total_count}, waiting for worker...`),
        );

        if (TERMINAL_RESIZE_STATUSES.has(job.status)) {
          await fetchAssets(status, copyrightStatus, assetSource);
          return;
        }
      }

      setResizeMessage(t("批量改尺寸仍在后台处理，可稍后到图片任务页查看。", "Batch resize is still running. Check Image Jobs later."));
    } catch (requestError) {
      setResizeError(requestError instanceof Error ? requestError.message : t("任务处理失败", "Job processing failed"));
      setResizeMessage(null);
    } finally {
      setIsResizeRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <div>
            <label htmlFor="asset-status" className="block text-sm font-medium text-zinc-950">
              {t("状态", "Status")}
            </label>
            <select
              id="asset-status"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value as "all" | AssetStatus)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.zh, option.en)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="copyright-status" className="block text-sm font-medium text-zinc-950">
              {t("版权状态", "Copyright Status")}
            </label>
            <select
              id="copyright-status"
              value={copyrightStatus}
              onChange={(event) =>
                handleCopyrightStatusChange(event.target.value as "all" | CopyrightStatus)
              }
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {copyrightOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.zh, option.en)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="asset-source" className="block text-sm font-medium text-zinc-950">
              {t("素材分类", "Asset Category")}
            </label>
            <select
              id="asset-source"
              value={assetSource}
              onChange={(event) => handleAssetSourceChange(event.target.value as AssetSourceFilter)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.zh, option.en)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={assets.length === 0}
            className="self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {assets.length > 0 && assets.every((asset) => selectedIds.has(asset.id))
              ? t("取消全选", "Deselect All")
              : t("全选当前", "Select Current")}
          </button>

          <button
            type="button"
            onClick={() => void fetchAssets(status, copyrightStatus, assetSource)}
            disabled={isLoading}
            className="self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isLoading ? t("刷新中...", "Refreshing...") : t("刷新列表", "Refresh List")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>{t(`共 ${assets.length} 张素材`, `${assets.length} assets`)}</span>
          <span>{t(`已选择 ${selectedCount} 张`, `${selectedCount} selected`)}</span>
          {selectedAssets.length > 0 ? (
            <span className="text-zinc-500">
              {t("最近选择：", "Recent selection: ")}{selectedAssets.slice(0, 3).map((asset) => asset.filename).join(t("、", ", "))}
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setResizeError(null);
              setIsResizeDialogOpen(true);
            }}
            disabled={selectedCount === 0 || isResizeRunning}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {t("批量改尺寸", "Batch Resize")}
          </button>
          <button
            type="button"
            onClick={() => void deleteAssetIds(Array.from(selectedIds))}
            disabled={selectedCount === 0 || isDeleting || isResizeRunning}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
          >
            {isDeleting ? t("删除中...", "Deleting...") : t("批量删除", "Batch Delete")}
          </button>
          <span className="text-sm text-zinc-500">{t("会基于原图生成处理后图片，不覆盖原图。", "Generates processed images from originals without overwriting originals.")}</span>
        </div>
      </section>

      {deleteMessage ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {deleteMessage}
        </div>
      ) : null}

      {resizeJob || resizeMessage || resizeError ? (
        <section className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">{t("批量改尺寸进度", "Batch Resize Progress")}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {resizeMessage ?? t("等待任务结果", "Waiting for job result")}
              </p>
            </div>
            {resizeJob ? (
              <span className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">
                {t(resizeJobStatusLabels[resizeJob.status].zh, resizeJobStatusLabels[resizeJob.status].en)}
              </span>
            ) : null}
          </div>

          {resizeJob ? (
            <div className="mt-4 space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${resizeJob.status === "pending" || resizeJob.status === "processing" ? Math.max(2, resizeProgressPercent) : resizeProgressPercent}%` }}
                />
              </div>
              <div className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-4">
                <span>{t("总数：", "Total: ")}{resizeJob.total_count}</span>
                <span>{t("已完成：", "Done: ")}{resizeCompletedCount}</span>
                <span>{t("成功：", "Success: ")}{resizeJob.success_count}</span>
                <span>{t("失败：", "Failed: ")}{resizeJob.failed_count}</span>
              </div>
            </div>
          ) : null}

          {resizeError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {resizeError}
            </div>
          ) : null}

          {failedResizeItems.length > 0 ? (
            <div className="mt-4 rounded-md border border-red-200">
              <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
                {t("失败原因", "Failure Reasons")}
              </div>
              <div className="divide-y divide-red-100">
                {failedResizeItems.map((item) => (
                  <div key={item.id} className="px-4 py-2 text-sm text-red-700">
                    {item.error_message ?? t("未知错误", "Unknown error")}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showInitialLoading ? (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          <div className="h-1 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full w-1/2 animate-shimmer rounded-full bg-emerald-500/70" />
          </div>
          <p className="mt-4">{t("正在加载素材...", "Loading assets...")}</p>
        </div>
      ) : null}

      {isLoading && assets.length > 0 ? (
        <div className="sticky top-2 z-20 overflow-hidden rounded-md border border-zinc-200 bg-white/90 px-4 py-3 text-sm text-zinc-600 shadow-sm backdrop-blur">
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-zinc-100">
            <div className="h-full w-1/3 animate-shimmer rounded-full bg-emerald-500" />
          </div>
          {t("正在更新列表...", "Updating list...")}
        </div>
      ) : null}

      {!isLoading && !error && assets.length === 0 ? (
        <div className="flex flex-col items-center rounded-md border border-dashed border-zinc-300 bg-white px-8 py-12 text-center">
          <img
            src="/images/empty-assets.png"
            alt=""
            className="h-36 w-36 rounded-lg object-cover opacity-90"
          />
          <p className="mt-5 text-sm font-medium text-zinc-950">{t("暂无素材", "No assets")}</p>
          <p className="mt-1.5 max-w-xs text-pretty text-sm text-zinc-600">
            {t("请先在上传页面添加图片，或调整筛选条件。", "Upload images first, or adjust filters.")}
          </p>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <div
          aria-busy={isLoading}
          className={[
            "grid gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
            isLoading ? "pointer-events-none opacity-60" : "opacity-100",
          ].join(" ")}
        >
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            const isAssetDeleting = deletingAssetIds.has(asset.id);
            const previewUrl = getAssetPreviewUrl(asset);
            const sourceLabel = getAssetSourceLabel(asset);

            return (
              <article
                key={asset.id}
                data-task-active={isAssetDeleting}
                className={[
                  "ui-enter ui-lift ui-task-card group overflow-hidden rounded-md border bg-white transition-[border-color,box-shadow,transform] duration-150 ease-out [contain-intrinsic-size:360px] [content-visibility:auto] hover:shadow-sm",
                  isSelected ? "border-zinc-950 ring-2 ring-zinc-950/10" : "border-zinc-200",
                ].join(" ")}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
                  <button
                    type="button"
                    onClick={() => openAssetDetail(asset.id)}
                    onMouseEnter={() => preloadAssetImage(asset)}
                    onFocus={() => preloadAssetImage(asset)}
                    className="group relative h-full w-full"
                    aria-label={t(`查看 ${asset.filename} 详情`, `View ${asset.filename} details`)}
                  >
                    <Image
                      src={getDisplayImageSrc(previewUrl)}
                      alt={asset.filename}
                      fill
                      sizes="(min-width: 1536px) 25vw, (min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                      loading="lazy"
                      quality={70}
                      className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                    />
                  </button>
                  <label className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAsset(asset.id)}
                      disabled={isAssetDeleting}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {t("选择", "Select")}
                  </label>
                  {isAssetDeleting ? (
                    <div className="ui-task-overlay z-20">
                      <span className="ui-activity" aria-hidden="true" />
                      <span className="ui-task-label">{deletePhase === "checking" ? t("检查引用", "Checking") : t("删除中", "Deleting")}</span>
                    </div>
                  ) : null}
                  <span
                    className={[
                      "ui-status-pop absolute right-3 top-3 rounded-md px-2.5 py-1 text-xs font-medium",
                      statusStyles[asset.status],
                    ].join(" ")}
                  >
                    {t(statusLabels[asset.status].zh, statusLabels[asset.status].en)}
                  </span>
                  <span
                    className={[
                      "absolute bottom-3 left-3 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm",
                      sourceStyles[asset.source] ?? "bg-zinc-100 text-zinc-700",
                    ].join(" ")}
                  >
                    {t(sourceLabel.zh, sourceLabel.en)}
                  </span>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="truncate text-sm font-semibold text-zinc-950">
                      {asset.filename}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      {asset.width} x {asset.height} · {asset.format.toUpperCase()} ·{" "}
                      {formatFileSize(asset.file_size)}
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-zinc-500">{t("版权状态", "Copyright")}</dt>
                      <dd className="mt-1 font-medium text-zinc-800">
                        {t(copyrightLabels[asset.copyright_status].zh, copyrightLabels[asset.copyright_status].en)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("创建时间", "Created At")}</dt>
                      <dd className="mt-1 font-medium text-zinc-800">
                        {formatDate(asset.created_at, language === "zh" ? "zh-CN" : "en-US")}
                      </dd>
                    </div>
                  </dl>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => openAssetDetail(asset.id)}
                      className="ui-press rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                    >
                      {t("查看图片", "Preview")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadAsset(asset)}
                      className="ui-press rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
                    >
                      {t("下载到本地", "Download")}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([asset.id])}
                    disabled={isDeleting || isResizeRunning}
                    className="ui-press w-full rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                  >
                    {t("删除素材", "Delete Asset")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        unitZh="张"
        unitEn="assets"
        onChange={(p) => {
          setPage(p);
          void fetchAssets(status, copyrightStatus, assetSource, p);
        }}
      />

      {isResizeDialogOpen ? (
        <div
          className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resize-dialog-title"
        >
          <div className="ui-modal-panel w-full max-w-2xl rounded-md bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-6 py-4">
              <h3 id="resize-dialog-title" className="text-base font-semibold text-zinc-950">
                {t("批量改尺寸", "Batch Resize")}
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                {t(`已选择 ${selectedCount} 张图片，处理结果会写入素材的 processed_url。`, `${selectedCount} image(s) selected. Results will be written to processed_url.`)}
              </p>
            </div>

            <div className="space-y-4 p-6">
              {resizePresetOptions.map((presetKey) => {
                const preset = resizePresets[presetKey];
                const isSelected = resizePresetKey === presetKey;

                return (
                  <label
                    key={preset.key}
                    className={[
                      "flex cursor-pointer gap-3 rounded-md border p-4 transition",
                      isSelected
                        ? "border-emerald-700 bg-emerald-50"
                        : "border-zinc-200 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="resize-preset"
                      value={preset.key}
                      checked={isSelected}
                      onChange={() => setResizePresetKey(preset.key)}
                      className="mt-1 h-4 w-4 border-zinc-300"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-zinc-950">
                        {t(preset.label, preset.labelEn)}
                      </span>
                      <span className="mt-1 block text-sm text-zinc-600">
                        {t(preset.description, preset.descriptionEn)}
                      </span>
                    </span>
                  </label>
                );
              })}

              <div className="rounded-md bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                {t("当前只做尺寸标准化，不做抠图、高清化或套图。原图记录会保留，处理后图片会上传到 Supabase Storage。", "This only standardizes image size. It does not cut out, enhance, or create mockups. Original records are kept and processed images are uploaded to Supabase Storage.")}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsResizeDialogOpen(false)}
                disabled={isResizeRunning}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {t("取消", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void startResizeJob()}
                disabled={isResizeRunning || selectedCount === 0}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isResizeRunning ? t("处理中...", "Processing...") : t("确认处理", "Confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedAsset && isMounted ? createPortal((
        <div
          className={["animate-fade-in fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-6 sm:py-6", detailOverlayClass].join(" ")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAssetDetail();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-detail-title"
        >
          <div className={["animate-scale-in relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-md", detailPanelClass].join(" ")}
            onMouseDown={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={closeAssetDetail}
              className={["absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border text-lg font-semibold transition", detailButtonClass].join(" ")}
              aria-label={t("关闭预览", "Close preview")}
            >
              ×
            </button>
            <div className={["flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3 pr-16 sm:px-6 sm:py-4 sm:pr-16", detailHeaderClass].join(" ")}>
              <div>
                <h3 id="asset-detail-title" className={["text-base font-semibold", detailTitleClass].join(" ")}>
                  {t("图片预览", "Image Preview")}
                </h3>
                <p className={["mt-1 text-sm", detailMutedClass].join(" ")}>{selectedAsset.filename}</p>
              </div>
            </div>

            <div className="grid gap-5 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
              <div className={["relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-md p-3 sm:min-h-[520px]", detailImageFrameClass].join(" ")}>
                <img
                  src={getDisplayImageSrc(getAssetPreviewUrl(selectedAsset))}
                  alt={selectedAsset.filename}
                  decoding="async"
                  className="max-h-[70vh] w-full object-contain"
                />
                <div className={["absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-end gap-2 border-t p-3 backdrop-blur", isDark ? "border-white/[0.08] bg-black/60" : "border-zinc-200 bg-white/85"].join(" ")}>
                  <button
                    type="button"
                    onClick={() => void downloadAsset(selectedAsset)}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
                  >
                    {t("下载", "Download")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([selectedAsset.id])}
                    disabled={isDeleting || isResizeRunning}
                    className={["rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed", detailDangerButtonClass].join(" ")}
                  >
                    {isDeleting ? t("删除中...", "Deleting...") : t("删除", "Delete")}
                  </button>
                  <button
                    type="button"
                    onClick={closeAssetDetail}
                    className={["rounded-md border px-3 py-2 text-sm font-medium transition", detailButtonClass].join(" ")}
                  >
                    {t("关闭", "Close")}
                  </button>
                </div>
              </div>

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className={detailMutedClass}>{t("文件名", "Filename")}</dt>
                  <dd className={["mt-1 break-all font-medium", detailValueClass].join(" ")}>
                    {selectedAsset.filename}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className={detailMutedClass}>{t("尺寸", "Dimensions")}</dt>
                    <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                      {selectedAsset.width} x {selectedAsset.height}
                    </dd>
                  </div>
                  <div>
                    <dt className={detailMutedClass}>{t("格式", "Format")}</dt>
                    <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                      {selectedAsset.format.toUpperCase()}
                    </dd>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className={detailMutedClass}>{t("文件大小", "File Size")}</dt>
                    <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                      {formatFileSize(selectedAsset.file_size)}
                    </dd>
                  </div>
                  <div>
                    <dt className={detailMutedClass}>{t("状态", "Status")}</dt>
                    <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                      {t(statusLabels[selectedAsset.status].zh, statusLabels[selectedAsset.status].en)}
                    </dd>
                  </div>
                </div>
                <div>
                  <dt className={detailMutedClass}>{t("版权状态", "Copyright Status")}</dt>
                  <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                    {t(copyrightLabels[selectedAsset.copyright_status].zh, copyrightLabels[selectedAsset.copyright_status].en)}
                  </dd>
                </div>
                <div>
                  <dt className={detailMutedClass}>{t("素材分类", "Asset Category")}</dt>
                  <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                    {t(getAssetSourceLabel(selectedAsset).zh, getAssetSourceLabel(selectedAsset).en)}
                  </dd>
                </div>
                <div>
                  <dt className={detailMutedClass}>{t("创建时间", "Created At")}</dt>
                  <dd className={["mt-1 font-medium", detailValueClass].join(" ")}>
                    {formatDate(selectedAsset.created_at, language === "zh" ? "zh-CN" : "en-US")}
                  </dd>
                </div>
                <div>
                  <dt className={detailMutedClass}>{t("原图地址", "Original URL")}</dt>
                  <dd className="mt-1">
                    <a
                      href={selectedAsset.original_url}
                      target="_blank"
                      rel="noreferrer"
                      className={["break-all font-medium", detailLinkClass].join(" ")}
                    >
                      {selectedAsset.original_url}
                    </a>
                  </dd>
                </div>
                {selectedAsset.preferred_design_url ? (
                  <div>
                    <dt className={detailMutedClass}>{t("优先设计图地址", "Preferred Design URL")}</dt>
                    <dd className="mt-1">
                      <a
                        href={selectedAsset.preferred_design_url}
                        target="_blank"
                        rel="noreferrer"
                        className={["break-all font-medium", detailLinkClass].join(" ")}
                      >
                        {selectedAsset.preferred_design_url}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {selectedAsset.print_extract_url ? (
                  <div>
                    <dt className={detailMutedClass}>{t("透明印花图地址", "Print Extract URL")}</dt>
                    <dd className="mt-1">
                      <a
                        href={selectedAsset.print_extract_url}
                        target="_blank"
                        rel="noreferrer"
                        className={["break-all font-medium", detailLinkClass].join(" ")}
                      >
                        {selectedAsset.print_extract_url}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {selectedAsset.cutout_url ? (
                  <div>
                    <dt className={detailMutedClass}>{t("抠图地址", "Cutout URL")}</dt>
                    <dd className="mt-1">
                      <a
                        href={selectedAsset.cutout_url}
                        target="_blank"
                        rel="noreferrer"
                        className={["break-all font-medium", detailLinkClass].join(" ")}
                      >
                        {selectedAsset.cutout_url}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {selectedAsset.processed_url ? (
                  <div>
                    <dt className={detailMutedClass}>{t("处理后地址", "Processed URL")}</dt>
                    <dd className="mt-1">
                      <a
                        href={selectedAsset.processed_url}
                        target="_blank"
                        rel="noreferrer"
                        className={["break-all font-medium", detailLinkClass].join(" ")}
                      >
                        {selectedAsset.processed_url}
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div className="hidden">
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([selectedAsset.id])}
                    disabled={isDeleting || isResizeRunning}
                    className={["rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed", detailDangerButtonClass].join(" ")}
                  >
                    {isDeleting ? t("删除中...", "Deleting...") : t("删除素材", "Delete Asset")}
                  </button>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
