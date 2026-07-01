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
import {
  fissionBackgroundOptions,
  fissionEffects,
  fissionOutputSizes,
  fissionPresets,
  fissionVariantCounts,
  type FissionBackgroundKey,
  type FissionEffectKey,
  type FissionOutputFormat,
  type FissionPresetKey,
  type FissionOutputSizeKey,
  type FissionVariantCountKey,
} from "@/lib/image-processing/fission-effects";

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
  item_status_counts?: {
    completed: number;
    failed: number;
    pending: number;
    processing: number;
  };
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

type FissionJobProgress = ResizeJobProgress;
type CreateFissionJobResponse = CreateResizeJobResponse;

type AssetsGalleryProps = {
  excludedSources?: string[];
  initialAssets: Asset[];
  initialError?: string | null;
  initialTotal?: number;
  processedFirst?: boolean;
  showFissionComparison?: boolean;
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

const assetStatusVisualStyles: Record<AssetStatus, string> = {
  failed: "#ef4444",
  processed: "#10b981",
  processing: "#f59e0b",
  uploaded: "#0ea5e9",
};

const copyrightVisualStyles: Record<CopyrightStatus, string> = {
  commercial_ok: "#10b981",
  forbidden: "#ef4444",
  owned: "#0ea5e9",
  risky: "#f59e0b",
  unknown: "#71717a",
};

const resizePresetOptions: ResizePresetKey[] = ["tshirt-print", "square-product"];
const fissionEffectOptions = Object.keys(fissionEffects) as FissionEffectKey[];
const fissionQuickEffectOptions = fissionEffectOptions.filter((effectKey) => fissionEffects[effectKey].category === "quick");
const fissionEntropyEffectOptions = fissionEffectOptions.filter((effectKey) => fissionEffects[effectKey].category === "entropy");
const fissionOutputSizeOptions = Object.keys(fissionOutputSizes) as FissionOutputSizeKey[];
const fissionOutputFormatOptions: FissionOutputFormat[] = ["png", "jpg"];
const fissionBackgroundOptionKeys = Object.keys(fissionBackgroundOptions) as FissionBackgroundKey[];
const fissionPresetOptions = Object.keys(fissionPresets) as FissionPresetKey[];
const fissionVariantCountOptions = Object.keys(fissionVariantCounts) as FissionVariantCountKey[];

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

function percent(value: number, totalValue: number) {
  if (totalValue <= 0) return 0;
  return Math.min(100, Math.round((value / totalValue) * 100));
}

export function AssetsGallery({
  excludedSources = [],
  initialAssets,
  initialError = null,
  initialTotal,
  processedFirst = false,
  showFissionComparison = false,
}: AssetsGalleryProps) {
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
  const [total, setTotal] = useState(initialTotal ?? initialAssets.length);
  const [isResizeDialogOpen, setIsResizeDialogOpen] = useState(false);
  const [resizePresetKey, setResizePresetKey] = useState<ResizePresetKey>("tshirt-print");
  const [resizeJob, setResizeJob] = useState<ResizeJobProgress | null>(null);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const [resizeMessage, setResizeMessage] = useState<string | null>(null);
  const [isResizeRunning, setIsResizeRunning] = useState(false);
  const [isFissionDialogOpen, setIsFissionDialogOpen] = useState(false);
  const [fissionEffectKey, setFissionEffectKey] = useState<FissionEffectKey>("flip_horizontal");
  const [fissionOutputSize, setFissionOutputSize] = useState<FissionOutputSizeKey>("original");
  const [fissionOutputFormat, setFissionOutputFormat] = useState<FissionOutputFormat>("png");
  const [fissionStrength, setFissionStrength] = useState(70);
  const [fissionSpacing, setFissionSpacing] = useState(12);
  const [fissionRotation, setFissionRotation] = useState(0);
  const [fissionBackgroundKey, setFissionBackgroundKey] = useState<FissionBackgroundKey>("transparent");
  const [fissionPresetKey, setFissionPresetKey] = useState<FissionPresetKey | "custom">("quick_flip");
  const [fissionVariantCountKey, setFissionVariantCountKey] = useState<FissionVariantCountKey>("one");
  const [fissionJob, setFissionJob] = useState<FissionJobProgress | null>(null);
  const [fissionError, setFissionError] = useState<string | null>(null);
  const [fissionMessage, setFissionMessage] = useState<string | null>(null);
  const [fissionTargetAssetIds, setFissionTargetAssetIds] = useState<string[] | null>(null);
  const [aiFissionPrompt, setAiFissionPrompt] = useState("保持主体和构图一致，生成一个相似但不同的商业图片变体。可以轻微改变姿势、方向、手部动作、表情、配色或背景，但不要改变核心主题。");
  const [aiFissionCountKey, setAiFissionCountKey] = useState<FissionVariantCountKey>("four");
  const [isAiFissionRunning, setIsAiFissionRunning] = useState(false);
  const [aiFissionError, setAiFissionError] = useState<string | null>(null);
  const [aiFissionMessage, setAiFissionMessage] = useState<string | null>(null);
  const [isFissionRunning, setIsFissionRunning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingAssetIds, setDeletingAssetIds] = useState<Set<string>>(new Set());
  const [deletePhase, setDeletePhase] = useState<"checking" | "deleting" | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const preloadedImageUrls = useRef<Set<string>>(new Set());
  const assetsRequestIdRef = useRef(0);
  const selectedCount = selectedIds.size;
  const isBatchProcessing = isResizeRunning || isFissionRunning || isAiFissionRunning;
  const totalPages = Math.ceil(total / 24);
  const visibleSourceOptions = useMemo(
    () => sourceOptions.filter((option) => option.value === "all" || !excludedSources.includes(option.value)),
    [excludedSources],
  );

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds],
  );
  const assetStatusRows = useMemo(
    () =>
      (Object.keys(statusLabels) as AssetStatus[]).map((assetStatusValue) => ({
        color: assetStatusVisualStyles[assetStatusValue],
        label: statusLabels[assetStatusValue],
        value: assets.filter((asset) => asset.status === assetStatusValue).length,
      })),
    [assets],
  );
  const copyrightRows = useMemo(
    () =>
      (Object.keys(copyrightLabels) as CopyrightStatus[]).map((copyrightValue) => ({
        color: copyrightVisualStyles[copyrightValue],
        label: copyrightLabels[copyrightValue],
        value: assets.filter((asset) => asset.copyright_status === copyrightValue).length,
      })),
    [assets],
  );
  const maxAssetStatusCount = Math.max(1, ...assetStatusRows.map((row) => row.value));
  const maxCopyrightCount = Math.max(1, ...copyrightRows.map((row) => row.value));
  const processedOnPageCount = assets.filter((asset) => Boolean(asset.preferred_design_url || asset.processed_url || asset.print_extract_url || asset.cutout_url)).length;
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );
  const fissionTargetCount = fissionTargetAssetIds?.length ?? selectedCount;
  const fissionTargetAsset = useMemo(
    () => fissionTargetAssetIds?.length === 1
      ? assets.find((asset) => asset.id === fissionTargetAssetIds[0]) ?? null
      : null,
    [assets, fissionTargetAssetIds],
  );
  const aiFissionSourceAsset = fissionTargetAsset ?? selectedAssets[0] ?? null;
  const resizeCompletedCount = resizeJob
    ? resizeJob.success_count + resizeJob.failed_count
    : 0;
  const resizeProgressPercent =
    resizeJob && resizeJob.total_count > 0
      ? Math.round((resizeCompletedCount / resizeJob.total_count) * 100)
      : 0;
  const failedResizeItems = resizeJob?.items.filter((item) => item.status === "failed") ?? [];
  const fissionCompletedCount = fissionJob
    ? fissionJob.success_count + fissionJob.failed_count
    : 0;
  const fissionProgressPercent =
    fissionJob && fissionJob.total_count > 0
      ? Math.round((fissionCompletedCount / fissionJob.total_count) * 100)
      : 0;
  const activeBatchJob = resizeJob ?? fissionJob;
  const activeBatchProgress = activeBatchJob === resizeJob ? resizeProgressPercent : fissionProgressPercent;
  const failedFissionItems = fissionJob?.items.filter((item) => item.status === "failed") ?? [];
  const completedFissionItems = fissionJob?.items.filter((item) => item.status === "completed" && item.output_url) ?? [];
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
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selectedAsset) {
      return;
    }

    const mainScroll = document.getElementById("pod-main-scroll");
    const originalOverflow = document.body.style.overflow;
    const originalMainOverflow = mainScroll?.style.overflow;
    document.body.style.overflow = "hidden";
    if (mainScroll) mainScroll.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAssetDetail();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      if (mainScroll) mainScroll.style.overflow = originalMainOverflow ?? "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedAsset]);

  useEffect(() => {
    if (!isResizeDialogOpen) {
      return;
    }

    const mainScroll = document.getElementById("pod-main-scroll");
    const originalOverflow = document.body.style.overflow;
    const originalMainOverflow = mainScroll?.style.overflow;
    document.body.style.overflow = "hidden";
    if (mainScroll) mainScroll.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isResizeRunning) {
        setIsResizeDialogOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      if (mainScroll) mainScroll.style.overflow = originalMainOverflow ?? "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isResizeDialogOpen, isResizeRunning]);

  useEffect(() => {
    if (!isFissionDialogOpen) {
      return;
    }

    const mainScroll = document.getElementById("pod-main-scroll");
    const originalOverflow = document.body.style.overflow;
    const originalMainOverflow = mainScroll?.style.overflow;
    document.body.style.overflow = "hidden";
    if (mainScroll) mainScroll.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isFissionRunning) {
        setIsFissionDialogOpen(false);
        setFissionTargetAssetIds(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      if (mainScroll) mainScroll.style.overflow = originalMainOverflow ?? "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFissionDialogOpen, isFissionRunning]);

  async function fetchAssets(
    nextStatus: "all" | AssetStatus = status,
    nextCopyrightStatus: "all" | CopyrightStatus = copyrightStatus,
    nextSource: AssetSourceFilter = assetSource,
    nextPage: number = page,
  ) {
    const requestId = assetsRequestIdRef.current + 1;
    assetsRequestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchAssetsAction(nextStatus, nextCopyrightStatus, nextSource, nextPage, excludedSources);
      if (requestId !== assetsRequestIdRef.current) return;

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
      if (requestId !== assetsRequestIdRef.current) return;
      setError(requestError instanceof Error ? requestError.message : t("读取素材失败", "Failed to load assets"));
      setAssets([]);
      setSelectedIds(new Set());
    } finally {
      if (requestId === assetsRequestIdRef.current) {
        setIsLoading(false);
      }
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

  function closeFissionDialog() {
    if (isFissionRunning) return;
    setIsFissionDialogOpen(false);
    setFissionTargetAssetIds(null);
  }

  function openBatchFissionDialog() {
    setFissionTargetAssetIds(null);
    setFissionError(null);
    setIsFissionDialogOpen(true);
  }

  function openSingleFissionDialog(assetId: string) {
    setFissionTargetAssetIds([assetId]);
    setFissionError(null);
    setSelectedAssetId(null);
    setIsFissionDialogOpen(true);
  }

  function getAssetPreviewUrl(asset: Asset) {
    if (processedFirst) {
      return (
        asset.processed_url ??
        asset.preferred_design_url ??
        asset.print_extract_url ??
        asset.cutout_url ??
        asset.original_url
      );
    }

    return (
      asset.preferred_design_url ??
      asset.print_extract_url ??
      asset.cutout_url ??
      asset.processed_url ??
      asset.original_url
    );
  }

  function getAssetResultUrl(asset: Asset) {
    return asset.processed_url;
  }

  function getFissionInputUrl(asset: Asset) {
    return (
      asset.preferred_design_url ??
      asset.print_extract_url ??
      asset.cutout_url ??
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

  function getFissionVariantCountKey(value: number): FissionVariantCountKey {
    return fissionVariantCountOptions.find((countKey) => fissionVariantCounts[countKey].value === value) ?? "one";
  }

  function applyFissionPreset(presetKey: FissionPresetKey) {
    const preset = fissionPresets[presetKey];
    setFissionPresetKey(presetKey);
    setFissionBackgroundKey(preset.backgroundKey);
    setFissionEffectKey(preset.effectKey);
    setFissionOutputFormat(preset.format);
    setFissionOutputSize(preset.outputSize);
    setFissionRotation(preset.rotation);
    setFissionSpacing(preset.spacing);
    setFissionStrength(preset.strength);
    setFissionVariantCountKey(getFissionVariantCountKey(preset.variantCount));
  }

  function markFissionCustom() {
    if (fissionPresetKey !== "custom") {
      setFissionPresetKey("custom");
    }
  }

  function resetFissionSettings() {
    applyFissionPreset("quick_flip");
  }

  function randomizeFissionSettings() {
    const effects = Math.random() > 0.72 ? fissionEntropyEffectOptions : fissionQuickEffectOptions;
    const outputSizes: FissionOutputSizeKey[] = ["original", "square_2048", "square_3000", "aop_5400"];
    const effectKey = effects[Math.floor(Math.random() * effects.length)] ?? "entropy_variant";
    const backgroundKey = fissionBackgroundOptionKeys[Math.floor(Math.random() * fissionBackgroundOptionKeys.length)] ?? "transparent";
    const isEntropy = fissionEffects[effectKey].category === "entropy";

    setFissionPresetKey("custom");
    setFissionBackgroundKey(backgroundKey);
    setFissionEffectKey(effectKey);
    setFissionOutputFormat(backgroundKey === "transparent" ? "png" : Math.random() > 0.45 ? "jpg" : "png");
    setFissionOutputSize(outputSizes[Math.floor(Math.random() * outputSizes.length)] ?? "original");
    setFissionRotation(Math.round((Math.random() * 80 - 40) / 5) * 5);
    setFissionSpacing(Math.round((Math.random() * 34) / 2) * 2);
    setFissionStrength(45 + Math.round(Math.random() * 45));
    setFissionVariantCountKey(isEntropy ? "nine" : "one");
  }

  async function fetchResizeJob(jobId: string, summary = false) {
    const response = await fetch(`/api/image-jobs/${jobId}${summary ? "?summary=1" : ""}`, {
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

  async function ensureFissionWorkerReady() {
    try {
      const response = await fetch("/api/local-worker/status", { cache: "no-store" });
      const data = (await response.json()) as WorkerStatusResponse;

      if (!response.ok) {
        return t("无法读取 worker 状态，裂变任务仍会进入队列。", "Could not read worker status. The fission job will still be queued.");
      }

      if (data.online === false) {
        throw new Error(t("本地 worker 未在线，请先启动 pod-ai-worker。", "Local worker is offline. Start pod-ai-worker first."));
      }

      if (data.missing_job_types?.includes("fission") || data.blocked_job_types?.includes("fission")) {
        throw new Error(t("本地 worker 当前没有启用 fission 任务类型，请检查 LOCAL_IMAGE_WORKER_JOB_TYPES。", "Local worker does not have fission enabled. Check LOCAL_IMAGE_WORKER_JOB_TYPES."));
      }
    } catch (workerError) {
      if (
        workerError instanceof Error
        && (workerError.message.includes("pod-ai-worker") || workerError.message.includes("LOCAL_IMAGE_WORKER_JOB_TYPES"))
      ) {
        throw workerError;
      }

      return t("暂时无法读取 worker 状态，裂变任务仍会进入队列。", "Could not read worker status. The fission job will still be queued.");
    }

    return null;
  }

  async function fetchFissionJob(jobId: string, summary = false) {
    return fetchResizeJob(jobId, summary) as Promise<FissionJobProgress>;
  }

  async function startAiFissionJobs() {
    if (!aiFissionSourceAsset) {
      setAiFissionError(t("请先选择一张参考图", "Select one reference image first"));
      return;
    }

    const prompt = aiFissionPrompt.trim();
    if (!prompt) {
      setAiFissionError(t("请先填写 AI 裂变要求", "Enter AI fission instructions first"));
      return;
    }

    const count = fissionVariantCounts[aiFissionCountKey].value;
    const referenceUrl = getFissionInputUrl(aiFissionSourceAsset);
    const width = Math.max(512, Math.min(1536, aiFissionSourceAsset.width || 1024));
    const height = Math.max(512, Math.min(1536, aiFissionSourceAsset.height || 1024));
    const basePrompt = [
      "Use the reference image as the visual source.",
      "Create a similar but meaningfully different image variant.",
      "Preserve the main subject identity, product category, composition logic, and commercial usability.",
      "Do not copy text incorrectly. If the image contains readable text or logos, keep them clean or simplify them safely.",
      prompt,
    ].join(" ");

    setIsAiFissionRunning(true);
    setAiFissionError(null);
    setAiFissionMessage(t(`正在创建 ${count} 个 AI 裂变任务...`, `Creating ${count} AI fission jobs...`));

    try {
      const jobIds: string[] = [];
      const indexes = Array.from({ length: count }, (_, index) => index);
      const concurrency = Math.min(3, indexes.length);

      async function createAiFissionJob(index: number) {
        const response = await fetch("/api/ai/generate-image", {
          body: JSON.stringify({
            async: true,
            height,
            prompt: `${basePrompt} Variant ${index + 1}/${count}: change one or two visual details, such as direction, pose, hand action, expression, colorway, lighting, or background, while keeping the result close to the reference.`,
            queue: true,
            reference_url: referenceUrl,
            save_to_assets: true,
            wait: false,
            width,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const data = (await response.json()) as { error?: string; job_id?: string };

        if (!response.ok || !data.job_id) {
          throw new Error(data.error ?? t("AI 裂变任务创建失败", "Failed to create AI fission job"));
        }

        jobIds.push(data.job_id);
        setAiFissionMessage(t(`AI 裂变任务已创建 ${jobIds.length}/${count}，正在进入 worker 队列...`, `Created ${jobIds.length}/${count} AI fission jobs. Queuing for worker...`));
      }

      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (indexes.length > 0) {
            const index = indexes.shift();
            if (index === undefined) return;
            await createAiFissionJob(index);
          }
        }),
      );

      setAiFissionMessage(t(`AI 裂变已进入队列：${jobIds.length} 个任务。结果会自动保存到素材库，可在图片任务查看进度。`, `AI fission queued: ${jobIds.length} jobs. Results will be saved to Assets; check Image Jobs for progress.`));
    } catch (error) {
      setAiFissionError(error instanceof Error ? error.message : t("AI 裂变任务创建失败", "Failed to create AI fission jobs"));
    } finally {
      setIsAiFissionRunning(false);
    }
  }

  async function startFissionJob() {
    const assetIds = fissionTargetAssetIds ? [...fissionTargetAssetIds] : Array.from(selectedIds);
    const variantCount = fissionVariantCounts[fissionVariantCountKey].value;
    const outputCount = assetIds.length * variantCount;
    const isSingleFission = outputCount === 1;
    const outputFormat = fissionBackgroundKey === "transparent" ? "png" : fissionOutputFormat;

    if (assetIds.length === 0) {
      setFissionError(t("请先选择要裂变的图片", "Please select images to create fission variants"));
      return;
    }

    setIsFissionRunning(true);
    setFissionError(null);
    setFissionMessage(isSingleFission ? t("正在创建单张快速裂变任务...", "Creating single quick fission job...") : t(`正在创建快速裂变任务，预计输出 ${outputCount} 张...`, `Creating quick fission job with ${outputCount} expected outputs...`));
    setFissionJob(null);

    try {
      const workerWarning = await ensureFissionWorkerReady();
      if (workerWarning) {
        setFissionMessage(workerWarning);
      }

      const createResponse = await fetch("/api/image-jobs/fission", {
        body: JSON.stringify({
          asset_ids: assetIds,
          background_key: fissionBackgroundKey,
          effect_key: fissionEffectKey,
          output_format: outputFormat,
          output_size: fissionOutputSize,
          preset_key: fissionPresetKey,
          rotation: fissionRotation,
          spacing: fissionSpacing,
          strength: fissionStrength,
          variant_count: variantCount,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const createData = (await createResponse.json()) as CreateFissionJobResponse;

      if (!createResponse.ok || !createData.job) {
        throw new Error(createData.error ?? t("裂变任务创建失败", "Failed to create fission job"));
      }

      const jobId = createData.job.id;
      setFissionJob({
        ...createData.job,
        items: [],
      });
      setFissionMessage(isSingleFission ? t(`单张快速裂变任务已创建：${jobId}，等待 worker 处理...`, `Single quick fission job created: ${jobId}. Waiting for the worker...`) : t(`快速裂变任务已创建：${jobId}，等待 worker 处理 ${outputCount} 张结果...`, `Quick fission job created: ${jobId}. Waiting for the worker to process ${outputCount} outputs...`));
      setIsFissionDialogOpen(false);
      setFissionTargetAssetIds(null);

      for (let attempt = 0; attempt < RESIZE_MAX_POLLS; attempt += 1) {
        await sleep(RESIZE_POLL_INTERVAL_MS);

        const job = await fetchFissionJob(jobId, true);
        const completedCount = job.success_count + job.failed_count;
        const processingCount = job.item_status_counts?.processing ?? job.items.filter((item) => item.status === "processing").length;
        const pendingCount = job.item_status_counts?.pending ?? job.items.filter((item) => item.status === "pending").length;
        const percent = job.total_count > 0 ? Math.min(100, Math.round((completedCount / job.total_count) * 100)) : 0;

        setFissionJob(job);
        setFissionMessage(
          TERMINAL_RESIZE_STATUSES.has(job.status)
            ? isSingleFission
              ? t(`单张快速裂变完成：${completedCount}/${job.total_count}`, `Single quick fission complete: ${completedCount}/${job.total_count}`)
              : t(`快速裂变完成：${completedCount}/${job.total_count}`, `Quick fission complete: ${completedCount}/${job.total_count}`)
            : processingCount > 0
              ? t(`worker 裂变处理中：完成 ${completedCount}/${job.total_count}，运行中 ${processingCount}，${percent}%`, `Worker fission processing: done ${completedCount}/${job.total_count}, running ${processingCount}, ${percent}%`)
              : attempt >= 15 && completedCount === 0
                ? t(`裂变任务已排队但 worker 暂未领取：待处理 ${pendingCount}/${job.total_count}。请检查 pod-ai-worker 日志。`, `Fission job is queued but worker has not claimed it yet: pending ${pendingCount}/${job.total_count}. Check pod-ai-worker logs.`)
                : t(`裂变任务已排队：待处理 ${pendingCount}/${job.total_count}，等待 worker 领取...`, `Fission job queued: pending ${pendingCount}/${job.total_count}, waiting for worker...`),
        );

        if (TERMINAL_RESIZE_STATUSES.has(job.status)) {
          const detailedJob = await fetchFissionJob(jobId).catch(() => job);
          setFissionJob(detailedJob);
          await fetchAssets(status, copyrightStatus, assetSource);
          return;
        }
      }

      setFissionMessage(isSingleFission ? t("单张快速裂变仍在后台处理，可稍后到图片任务页查看。", "Single quick fission is still running. Check Image Jobs later.") : t("快速裂变仍在后台处理，可稍后到图片任务页查看。", "Quick fission is still running. Check Image Jobs later."));
    } catch (requestError) {
      setFissionError(requestError instanceof Error ? requestError.message : t("裂变任务处理失败", "Fission job failed"));
      setFissionMessage(null);
    } finally {
      setIsFissionRunning(false);
    }
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

        const job = await fetchResizeJob(jobId, true);
        const completedCount = job.success_count + job.failed_count;
        const processingCount = job.item_status_counts?.processing ?? job.items.filter((item) => item.status === "processing").length;
        const pendingCount = job.item_status_counts?.pending ?? job.items.filter((item) => item.status === "pending").length;
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
          const detailedJob = await fetchResizeJob(jobId).catch(() => job);
          setResizeJob(detailedJob);
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("素材观察面板", "Asset Overview")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t("快速查看当前页素材结构、版权风险和批量任务状态。", "Quickly review visible asset mix, copyright risk, and batch job status.")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">{t("全部素材", "Total")}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">{total}</p>
            </div>
            <div className="rounded-md bg-sky-50 px-3 py-2">
              <p className="text-sky-700">{t("当前页", "Page")}</p>
              <p className="mt-1 text-lg font-semibold text-sky-800">{assets.length}</p>
            </div>
            <div className="rounded-md bg-emerald-50 px-3 py-2">
              <p className="text-emerald-700">{t("有处理图", "Processed")}</p>
              <p className="mt-1 text-lg font-semibold text-emerald-800">{processedOnPageCount}</p>
            </div>
            <div className="rounded-md bg-amber-50 px-3 py-2">
              <p className="text-amber-700">{t("已选择", "Selected")}</p>
              <p className="mt-1 text-lg font-semibold text-amber-800">{selectedCount}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-950">{t("处理状态分布", "Processing Status")}</p>
            <div className="mt-4 space-y-3">
              {assetStatusRows.map((row) => (
                <div key={row.label.en}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="inline-flex items-center gap-2 text-zinc-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                      {t(row.label.zh, row.label.en)}
                    </span>
                    <span className="text-zinc-500">{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ backgroundColor: row.color, width: `${row.value > 0 ? Math.max(5, percent(row.value, maxAssetStatusCount)) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-950">{t("版权风险分布", "Copyright Risk")}</p>
            <div className="mt-4 space-y-3">
              {copyrightRows.map((row) => (
                <div key={row.label.en}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="inline-flex items-center gap-2 text-zinc-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                      {t(row.label.zh, row.label.en)}
                    </span>
                    <span className="text-zinc-500">{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ backgroundColor: row.color, width: `${row.value > 0 ? Math.max(5, percent(row.value, maxCopyrightCount)) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {activeBatchJob ? (
          <div className="mt-5 rounded-md border border-cyan-200 bg-cyan-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-cyan-900">
              <span className="font-semibold">{resizeJob ? t("批量改尺寸任务", "Batch Resize Job") : t("裂变处理任务", "Fission Job")}</span>
              <span>{activeBatchProgress}% · {t(resizeJobStatusLabels[activeBatchJob.status].zh, resizeJobStatusLabels[activeBatchJob.status].en)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-cyan-100">
              <div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: `${Math.max(3, activeBatchProgress)}%` }} />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-cyan-800 sm:grid-cols-4">
              <span>{t("总数", "Total")} {activeBatchJob.total_count}</span>
              <span>{t("成功", "Success")} {activeBatchJob.success_count}</span>
              <span>{t("失败", "Failed")} {activeBatchJob.failed_count}</span>
              <span>{t("已处理", "Done")} {activeBatchJob.success_count + activeBatchJob.failed_count}</span>
            </div>
          </div>
        ) : null}
      </section>

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
              {visibleSourceOptions.map((option) => (
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
          <span>{t(`共 ${total} 张素材`, `${total} assets`)}</span>
          <span>{t(`当前页 ${assets.length} 张`, `${assets.length} on this page`)}</span>
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
            disabled={selectedCount === 0 || isBatchProcessing}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {t("批量改尺寸", "Batch Resize")}
          </button>
          <button
            type="button"
            onClick={openBatchFissionDialog}
            disabled={selectedCount === 0 || isBatchProcessing}
            className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {t("快速裂变", "Quick Fission")}
          </button>
          <button
            type="button"
            onClick={() => void deleteAssetIds(Array.from(selectedIds))}
            disabled={selectedCount === 0 || isDeleting || isBatchProcessing}
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

      {fissionJob || fissionMessage || fissionError ? (
        <section className="rounded-md border border-cyan-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">{t("裂变处理进度", "Fission Progress")}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {fissionMessage ?? t("等待裂变任务结果", "Waiting for fission job result")}
              </p>
            </div>
            {fissionJob ? (
              <span className="rounded-md bg-cyan-50 px-3 py-1.5 text-sm font-medium text-cyan-700">
                {t(resizeJobStatusLabels[fissionJob.status].zh, resizeJobStatusLabels[fissionJob.status].en)}
              </span>
            ) : null}
          </div>

          {fissionJob ? (
            <div className="mt-4 space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-cyan-600 transition-all"
                  style={{ width: `${fissionJob.status === "pending" || fissionJob.status === "processing" ? Math.max(2, fissionProgressPercent) : fissionProgressPercent}%` }}
                />
              </div>
              <div className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-4">
                <span>{t("总数：", "Total: ")}{fissionJob.total_count}</span>
                <span>{t("已完成：", "Done: ")}{fissionCompletedCount}</span>
                <span>{t("成功：", "Success: ")}{fissionJob.success_count}</span>
                <span>{t("失败：", "Failed: ")}{fissionJob.failed_count}</span>
              </div>
            </div>
          ) : null}

          {fissionError ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {fissionError}
            </div>
          ) : null}

          {completedFissionItems.length > 0 ? (
            <div className="mt-4 rounded-md border border-cyan-200 bg-cyan-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-cyan-900">
                  {t(`已生成 ${completedFissionItems.length} 张裂变图`, `${completedFissionItems.length} fission output(s) generated`)}
                </p>
                <button
                  type="button"
                  onClick={() => void fetchAssets(status, copyrightStatus, assetSource)}
                  className="rounded-md border border-cyan-300 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
                >
                  {t("刷新查看结果", "Refresh Results")}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {completedFissionItems.slice(0, 8).map((item, index) => (
                  <a
                    key={item.id}
                    href={item.output_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-800"
                  >
                    {t(`打开结果 ${index + 1}`, `Open Result ${index + 1}`)}
                  </a>
                ))}
                {completedFissionItems.length > 8 ? (
                  <span className="px-2 py-1.5 text-xs text-cyan-800">
                    {t(`还有 ${completedFissionItems.length - 8} 张，请在刷新后的卡片详情里查看处理图。`, `${completedFissionItems.length - 8} more. Refresh and open card details to view processed images.`)}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-cyan-800">
                {t("单张裂变会写回原素材；一图多裂变会作为新素材保存，刷新后可在素材库查看。", "Single fission writes back to the source asset. Multi-variant fission saves outputs as new assets; refresh to view them in Assets.")}
              </p>
            </div>
          ) : null}

          {failedFissionItems.length > 0 ? (
            <div className="mt-4 rounded-md border border-red-200">
              <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
                {t("裂变失败原因", "Fission Failure Reasons")}
              </div>
              <div className="divide-y divide-red-100">
                {failedFissionItems.map((item) => (
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
            showFissionComparison
              ? "grid gap-4 transition-opacity duration-200 sm:grid-cols-2 2xl:grid-cols-3"
              : "grid gap-4 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
            isLoading ? "pointer-events-none opacity-60" : "opacity-100",
          ].join(" ")}
        >
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            const isAssetDeleting = deletingAssetIds.has(asset.id);
            const previewUrl = getAssetPreviewUrl(asset);
            const resultUrl = getAssetResultUrl(asset);
            const fissionInputUrl = getFissionInputUrl(asset);
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
                  {showFissionComparison ? (
                    <div className="grid h-full grid-cols-2">
                      <button
                        type="button"
                        onClick={() => openAssetDetail(asset.id)}
                        onMouseEnter={() => preloadAssetImage(asset)}
                        onFocus={() => preloadAssetImage(asset)}
                        className="group relative h-full w-full overflow-hidden border-r border-white/80 bg-zinc-100"
                        aria-label={t(`\u67e5\u770b ${asset.filename} \u539f\u56fe`, `View ${asset.filename} original`)}
                      >
                        <Image
                          src={getDisplayImageSrc(fissionInputUrl)}
                          alt={asset.filename}
                          fill
                          sizes="(min-width: 1536px) 12vw, (min-width: 1280px) 16vw, (min-width: 640px) 25vw, 50vw"
                          loading="lazy"
                          quality={65}
                          className="object-contain p-2 transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                        />
                        <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                          {t("\u539f\u56fe", "Original")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openAssetDetail(asset.id)}
                        onMouseEnter={() => preloadAssetImage(asset)}
                        onFocus={() => preloadAssetImage(asset)}
                        className="group relative h-full w-full overflow-hidden bg-white bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]"
                        aria-label={t(`\u67e5\u770b ${asset.filename} \u88c2\u53d8\u7ed3\u679c`, `View ${asset.filename} fission result`)}
                      >
                        {resultUrl ? (
                          <Image
                            src={getDisplayImageSrc(resultUrl)}
                            alt={asset.filename}
                            fill
                            sizes="(min-width: 1536px) 12vw, (min-width: 1280px) 16vw, (min-width: 640px) 25vw, 50vw"
                            loading="lazy"
                            quality={70}
                            className="object-contain p-2 transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center px-3 text-center text-xs font-medium text-zinc-500">
                            {t("\u6682\u65e0\u7ed3\u679c", "No result yet")}
                          </span>
                        )}
                        <span className="absolute bottom-2 left-2 rounded-md bg-cyan-700/90 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                          {t("\u7ed3\u679c\u56fe", "Result")}
                        </span>
                      </button>
                    </div>
                  ) : (
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
                  )}
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
                      <span className="ui-spinner ui-spinner-md text-cyan-300" aria-hidden="true" />
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
                      showFissionComparison ? "absolute bottom-3 right-3 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm" : "absolute bottom-3 left-3 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm",
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
                    {showFissionComparison ? (
                      <p className={["mt-2 inline-flex rounded-md px-2 py-1 text-xs font-semibold", resultUrl ? "bg-cyan-50 text-cyan-700" : "bg-zinc-100 text-zinc-500"].join(" ")}>
                        {resultUrl ? t("已生成裂变结果", "Fission result ready") : t("待生成裂变结果", "No fission result yet")}
                      </p>
                    ) : null}
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
                  {showFissionComparison ? (
                    <button
                      type="button"
                      onClick={() => openSingleFissionDialog(asset.id)}
                      disabled={isBatchProcessing || isAssetDeleting || isDeleting}
                      className="ui-press w-full rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      {t("单张快速裂变", "Single Quick Fission")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([asset.id])}
                    disabled={isDeleting || isBatchProcessing}
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

      {isResizeDialogOpen && isMounted ? createPortal((
        <div
          className={[
            "ui-modal-overlay fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-6 sm:py-6",
            isDark ? "bg-black/75" : "bg-zinc-950/60",
          ].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="resize-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isResizeRunning) {
              setIsResizeDialogOpen(false);
            }
          }}
        >
          <div
            className={[
              "ui-modal-panel relative flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-md border shadow-2xl sm:max-h-[calc(100vh-3rem)]",
              isDark
                ? "border-white/[0.08] bg-[#0f0f10] text-zinc-100 shadow-black/50"
                : "border-zinc-200 bg-white text-zinc-950 shadow-black/20",
            ].join(" ")}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsResizeDialogOpen(false)}
              disabled={isResizeRunning}
              className={[
                "absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-800 hover:bg-zinc-100",
              ].join(" ")}
              aria-label={t("关闭批量改尺寸", "Close batch resize")}
            >
              x
            </button>

            <div className={[
              "shrink-0 border-b px-5 py-4 pr-16 sm:px-6",
              isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-zinc-200 bg-white",
            ].join(" ")}>
              <h3 id="resize-dialog-title" className={["text-base font-semibold", isDark ? "text-white" : "text-zinc-950"].join(" ")}>
                {t("批量改尺寸", "Batch Resize")}
              </h3>
              <p className={["mt-1 text-sm", isDark ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                {t(`已选择 ${selectedCount} 张图片，处理结果会写入素材的 processed_url。`, `${selectedCount} image(s) selected. Results will be written to processed_url.`)}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
              {resizePresetOptions.map((presetKey) => {
                const preset = resizePresets[presetKey];
                const isSelected = resizePresetKey === presetKey;

                return (
                  <label
                    key={preset.key}
                    className={[
                      "ui-hover-sheen flex cursor-pointer gap-3 rounded-md border p-4 transition",
                      isSelected
                        ? isDark
                          ? "border-cyan-300/40 bg-cyan-400/10"
                          : "border-emerald-700 bg-emerald-50"
                        : isDark
                          ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
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
                      <span className={["block text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                        {t(preset.label, preset.labelEn)}
                      </span>
                      <span className={["mt-1 block text-sm", isDark ? "text-zinc-400" : "text-zinc-600"].join(" ")}>
                        {t(preset.description, preset.descriptionEn)}
                      </span>
                    </span>
                  </label>
                );
              })}

              <div className={[
                "rounded-md border p-4 text-sm leading-6",
                isDark ? "border-cyan-300/15 bg-cyan-400/10 text-cyan-100" : "border-zinc-200 bg-zinc-50 text-zinc-600",
              ].join(" ")}>
                {t("当前只做尺寸标准化，不做抠图、高清化或套图。原图记录会保留，处理后图片会上传到 Supabase Storage。", "This only standardizes image size. It does not cut out, enhance, or create mockups. Original records are kept and processed images are uploaded to Supabase Storage.")}
              </div>
            </div>

            <div className={[
              "flex shrink-0 justify-end gap-3 border-t px-5 py-4 sm:px-6",
              isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-zinc-200 bg-white",
            ].join(" ")}>
              <button
                type="button"
                onClick={() => setIsResizeDialogOpen(false)}
                disabled={isResizeRunning}
                className={[
                  "rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                  isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-800 hover:bg-zinc-100",
                ].join(" ")}
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
      ), document.body) : null}

      {isFissionDialogOpen && isMounted ? createPortal((
        <div
          className={[
            "ui-modal-overlay fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-6 sm:py-6",
            isDark ? "bg-black/75" : "bg-zinc-950/60",
          ].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="fission-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isFissionRunning) {
              closeFissionDialog();
            }
          }}
        >
          <div
            className={[
              "ui-modal-panel relative flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-md border shadow-2xl sm:max-h-[calc(100vh-3rem)]",
              isDark
                ? "border-white/[0.08] bg-[#0f0f10] text-zinc-100 shadow-black/50"
                : "border-zinc-200 bg-white text-zinc-950 shadow-black/20",
            ].join(" ")}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeFissionDialog}
              disabled={isFissionRunning}
              className={[
                "absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-800 hover:bg-zinc-100",
              ].join(" ")}
              aria-label={fissionTargetAssetIds ? t("关闭单张快速裂变", "Close single quick fission") : t("关闭快速裂变", "Close quick fission")}
            >
              x
            </button>

            <div className={[
              "shrink-0 border-b px-5 py-4 pr-16 sm:px-6",
              isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-zinc-200 bg-white",
            ].join(" ")}>
              <h3 id="fission-dialog-title" className={["text-base font-semibold", isDark ? "text-white" : "text-zinc-950"].join(" ")}>
                {fissionTargetAssetIds ? t("单张快速裂变", "Single Quick Fission") : t("图片裂变", "Image Fission")}
              </h3>
              <p className={["mt-1 text-sm", isDark ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                {fissionTargetAsset
                  ? t(`当前图片：${fissionTargetAsset.filename}。快速裂变结果会写入该素材 processed_url；AI 裂变结果会作为新素材入库。`, `Current image: ${fissionTargetAsset.filename}. Quick fission writes to processed_url; AI fission saves new assets.`)
                  : t(`已选择 ${fissionTargetCount} 张图片。快速裂变会进入本地 worker；AI 裂变使用第一张作为参考图。`, `${fissionTargetCount} image(s) selected. Quick fission goes to the local worker; AI fission uses the first selected image as reference.`)}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
              <div className={[
                "rounded-md border p-4",
                isDark ? "border-violet-300/20 bg-violet-400/10" : "border-violet-200 bg-violet-50",
              ].join(" ")}>
                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <p className={["text-sm font-semibold", isDark ? "text-violet-100" : "text-violet-950"].join(" ")}>
                      {t("AI 裂变", "AI Fission")}
                    </p>
                    <p className={["mt-1 text-xs leading-5", isDark ? "text-violet-100/75" : "text-violet-800"].join(" ")}>
                      {t("用于语义改图：比如左手拿烟变右手拿烟、姿势变化、表情变化、背景变化。会调用 AI API，并把结果保存到素材库。", "For semantic edits such as changing hand action, pose, expression, or background. This uses the AI API and saves results to Assets.")}
                    </p>
                    <div className={["mt-3 rounded-md border p-3 text-xs", isDark ? "border-white/[0.08] bg-black/20 text-zinc-300" : "border-violet-200 bg-white text-zinc-600"].join(" ")}>
                      {aiFissionSourceAsset
                        ? t(`参考图：${aiFissionSourceAsset.filename}`, `Reference: ${aiFissionSourceAsset.filename}`)
                        : t("请先选择一张图片作为 AI 参考图。", "Select one image as the AI reference first.")}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <textarea
                      value={aiFissionPrompt}
                      onChange={(event) => setAiFissionPrompt(event.target.value)}
                      rows={4}
                      className={[
                        "w-full resize-y rounded-md border px-3 py-2 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20",
                        isDark ? "border-white/[0.12] bg-black/30 text-zinc-100 placeholder:text-zinc-500" : "border-violet-200 bg-white text-zinc-900 placeholder:text-zinc-400",
                      ].join(" ")}
                      placeholder={t("例如：保持人物一致，把左手拿烟改成右手拿烟，背景和衣服尽量不变。", "Example: keep the person consistent, change the cigarette from left hand to right hand, keep clothing and background close.")}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {fissionVariantCountOptions.map((countKey) => {
                        const count = fissionVariantCounts[countKey];
                        const isSelected = aiFissionCountKey === countKey;

                        return (
                          <button
                            key={countKey}
                            type="button"
                            onClick={() => setAiFissionCountKey(countKey)}
                            className={[
                              "rounded-md border px-3 py-2 text-xs font-semibold transition",
                              isSelected
                                ? isDark
                                  ? "border-violet-300/50 bg-violet-400/20 text-violet-100"
                                  : "border-violet-700 bg-violet-100 text-violet-900"
                                : isDark
                                  ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]"
                                  : "border-violet-200 bg-white text-violet-800 hover:bg-violet-50",
                            ].join(" ")}
                          >
                            {t(count.label, count.labelEn)}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => void startAiFissionJobs()}
                        disabled={isAiFissionRunning || !aiFissionSourceAsset}
                        className="ml-auto rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                      >
                        {isAiFissionRunning ? t("AI 排队中...", "Queuing AI...") : t("开始 AI 裂变", "Start AI Fission")}
                      </button>
                    </div>
                    {aiFissionMessage ? (
                      <div className={["rounded-md border px-3 py-2 text-xs", isDark ? "border-violet-300/20 bg-violet-400/10 text-violet-100" : "border-violet-200 bg-white text-violet-800"].join(" ")}>
                        {aiFissionMessage}
                      </div>
                    ) : null}
                    {aiFissionError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        {aiFissionError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className={[
                "rounded-md border p-4",
                isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-zinc-50",
              ].join(" ")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                      {t("快速裂变预设", "Quick Fission Presets")}
                    </p>
                    <p className={["mt-1 text-xs", isDark ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                      {t("本地处理，不调用 AI。适合镜像、旋转、缩放、换底色、基础平铺和一图多变体。", "Local processing without AI. Use it for flip, rotation, scale, background, tile, and one-to-many variants.")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={randomizeFissionSettings}
                      className={[
                        "rounded-md border px-3 py-2 text-xs font-semibold transition",
                        isDark ? "border-cyan-300/30 text-cyan-100 hover:bg-cyan-400/10" : "border-cyan-200 text-cyan-800 hover:bg-cyan-50",
                      ].join(" ")}
                    >
                      {t("随机变体", "Randomize")}
                    </button>
                    <button
                      type="button"
                      onClick={resetFissionSettings}
                      className={[
                        "rounded-md border px-3 py-2 text-xs font-semibold transition",
                        isDark ? "border-white/[0.12] text-zinc-300 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-700 hover:bg-white",
                      ].join(" ")}
                    >
                      {t("重置参数", "Reset")}
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {fissionPresetOptions.map((presetKey) => {
                    const preset = fissionPresets[presetKey];
                    const isSelected = fissionPresetKey === presetKey;

                    return (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => applyFissionPreset(presetKey)}
                        className={[
                          "rounded-md border px-3 py-2 text-left text-sm transition",
                          isSelected
                            ? isDark
                              ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
                              : "border-cyan-700 bg-cyan-50 text-cyan-900"
                            : isDark
                              ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]"
                              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        <span className="block font-semibold">{t(preset.label, preset.labelEn)}</span>
                        <span className={["mt-1 block text-xs", isDark ? "text-zinc-500" : "text-zinc-500"].join(" ")}>
                          {t(fissionEffects[preset.effectKey].label, fissionEffects[preset.effectKey].labelEn)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                  {t("快速裂变效果", "Quick Fission Effect")}
                </p>
                <div className="mt-3 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className={[
                    "rounded-md border p-3",
                    isDark ? "border-cyan-300/15 bg-cyan-400/5" : "border-cyan-200 bg-cyan-50/60",
                  ].join(" ")}>
                    <p className={["text-xs font-semibold uppercase tracking-[0.12em]", isDark ? "text-cyan-200" : "text-cyan-700"].join(" ")}>
                      {t("基础功能", "Basic Tools")}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {fissionQuickEffectOptions.map((effectKey) => {
                        const effect = fissionEffects[effectKey];
                        const isSelected = fissionEffectKey === effectKey;

                        return (
                          <label
                            key={effectKey}
                            className={[
                              "ui-hover-sheen flex cursor-pointer gap-3 rounded-md border p-3 transition",
                              isSelected
                                ? isDark
                                  ? "border-cyan-300/50 bg-cyan-400/10"
                                  : "border-cyan-700 bg-cyan-50"
                                : isDark
                                  ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                                  : "border-zinc-200 bg-white hover:bg-zinc-50",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="fission-effect"
                              value={effectKey}
                              checked={isSelected}
                              onChange={() => {
                                markFissionCustom();
                                setFissionEffectKey(effectKey);
                                if (fissionEffects[effectKey].category === "quick") setFissionVariantCountKey("one");
                              }}
                              className="mt-1 h-4 w-4 border-zinc-300"
                            />
                            <span>
                              <span className={["block text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                                {t(effect.label, effect.labelEn)}
                              </span>
                              <span className={["mt-1 block text-xs leading-5", isDark ? "text-zinc-400" : "text-zinc-600"].join(" ")}>
                                {t(effect.description, effect.descriptionEn)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className={[
                    "rounded-md border p-3",
                    isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-zinc-50/70",
                  ].join(" ")}>
                    <p className={["text-xs font-semibold uppercase tracking-[0.12em]", isDark ? "text-zinc-400" : "text-zinc-500"].join(" ")}>
                      {t("多次裂变", "Entropy Fission")}
                    </p>
                    <div className="mt-3 grid gap-3">
                      {fissionEntropyEffectOptions.map((effectKey) => {
                        const effect = fissionEffects[effectKey];
                        const isSelected = fissionEffectKey === effectKey;

                        return (
                          <label
                            key={effectKey}
                            className={[
                              "ui-hover-sheen flex cursor-pointer gap-3 rounded-md border p-3 transition",
                              isSelected
                                ? isDark
                                  ? "border-cyan-300/50 bg-cyan-400/10"
                                  : "border-cyan-700 bg-cyan-50"
                                : isDark
                                  ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                                  : "border-zinc-200 bg-white hover:bg-zinc-50",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="fission-effect"
                              value={effectKey}
                              checked={isSelected}
                              onChange={() => {
                                markFissionCustom();
                                setFissionEffectKey(effectKey);
                                if (fissionEffects[effectKey].category === "entropy") setFissionVariantCountKey("nine");
                              }}
                              className="mt-1 h-4 w-4 border-zinc-300"
                            />
                            <span>
                              <span className={["block text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                                {t(effect.label, effect.labelEn)}
                              </span>
                              <span className={["mt-1 block text-xs leading-5", isDark ? "text-zinc-400" : "text-zinc-600"].join(" ")}>
                                {t(effect.description, effect.descriptionEn)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                    {t("输出尺寸", "Output Size")}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {fissionOutputSizeOptions.map((sizeKey) => {
                      const size = fissionOutputSizes[sizeKey];
                      const isSelected = fissionOutputSize === sizeKey;

                      return (
                        <label
                          key={sizeKey}
                          className={[
                            "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                            isSelected
                              ? isDark
                                ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
                                : "border-cyan-700 bg-cyan-50 text-cyan-900"
                              : isDark
                                ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]"
                                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="fission-output-size"
                            value={sizeKey}
                            checked={isSelected}
                            onChange={() => {
                              markFissionCustom();
                              setFissionOutputSize(sizeKey);
                            }}
                            className="h-4 w-4 border-zinc-300"
                          />
                          <span>{t(size.label, size.labelEn)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                      {t("生成数量", "Output Count")}
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {fissionVariantCountOptions.map((countKey) => {
                        const count = fissionVariantCounts[countKey];
                        const isSelected = fissionVariantCountKey === countKey;

                        return (
                          <button
                            key={countKey}
                            type="button"
                            onClick={() => {
                              markFissionCustom();
                              setFissionVariantCountKey(countKey);
                              if (count.value > 1) setFissionEffectKey("entropy_variant");
                            }}
                            className={[
                              "rounded-md border px-3 py-2 text-sm font-medium transition",
                              isSelected
                                ? isDark
                                  ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
                                  : "border-cyan-700 bg-cyan-50 text-cyan-900"
                                : isDark
                                  ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]"
                                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                            ].join(" ")}
                          >
                            {t(count.label, count.labelEn)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                      {t("输出格式", "Output Format")}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {fissionOutputFormatOptions.map((format) => (
                        <button
                          key={format}
                          type="button"
                          disabled={fissionBackgroundKey === "transparent" && format === "jpg"}
                          onClick={() => {
                            if (fissionBackgroundKey === "transparent" && format === "jpg") return;
                            markFissionCustom();
                            setFissionOutputFormat(format);
                          }}
                          className={[
                            "rounded-md border px-3 py-2 text-sm font-medium uppercase transition",
                            fissionOutputFormat === format
                              ? isDark
                                ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
                                : "border-cyan-700 bg-cyan-50 text-cyan-900"
                              : isDark
                                ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]"
                                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                            fissionBackgroundKey === "transparent" && format === "jpg" ? "cursor-not-allowed opacity-40" : "",
                          ].join(" ")}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                      {t("底色", "Background")}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {fissionBackgroundOptionKeys.map((backgroundKey) => {
                        const background = fissionBackgroundOptions[backgroundKey];
                        const isSelected = fissionBackgroundKey === backgroundKey;

                        return (
                          <button
                            key={backgroundKey}
                            type="button"
                            onClick={() => {
                              markFissionCustom();
                              setFissionBackgroundKey(backgroundKey);
                              if (backgroundKey === "transparent") setFissionOutputFormat("png");
                            }}
                            className={[
                              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition",
                              isSelected
                                ? isDark
                                  ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100"
                                  : "border-cyan-700 bg-cyan-50 text-cyan-900"
                                : isDark
                                  ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]"
                                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "h-4 w-4 rounded-full border",
                                backgroundKey === "transparent" ? "bg-[linear-gradient(45deg,#ddd_25%,transparent_25%),linear-gradient(-45deg,#ddd_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#ddd_75%),linear-gradient(-45deg,transparent_75%,#ddd_75%)] bg-[length:8px_8px] bg-[position:0_0,0_4px,4px_-4px,-4px_0]" : "",
                                isDark ? "border-white/20" : "border-zinc-300",
                              ].join(" ")}
                              style={backgroundKey === "transparent" ? undefined : { backgroundColor: background.color }}
                              aria-hidden="true"
                            />
                            <span>{t(background.label, background.labelEn)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                        {t("缩放 / 强度", "Scale / Strength")}
                      </p>
                      <span className={["text-sm font-medium", isDark ? "text-cyan-200" : "text-cyan-700"].join(" ")}>
                        {fissionStrength}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={fissionStrength}
                      onChange={(event) => {
                        markFissionCustom();
                        setFissionStrength(Number(event.target.value));
                      }}
                      className="mt-3 w-full accent-cyan-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                        {t("间距 / 偏移", "Spacing / Offset")}
                      </p>
                      <span className={["text-sm font-medium", isDark ? "text-cyan-200" : "text-cyan-700"].join(" ")}>
                        {fissionSpacing}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={2}
                      value={fissionSpacing}
                      onChange={(event) => {
                        markFissionCustom();
                        setFissionSpacing(Number(event.target.value));
                      }}
                      className="mt-3 w-full accent-cyan-600"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className={["text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-950"].join(" ")}>
                        {t("旋转角度", "Rotation")}
                      </p>
                      <span className={["text-sm font-medium", isDark ? "text-cyan-200" : "text-cyan-700"].join(" ")}>
                        {fissionRotation}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={5}
                      value={fissionRotation}
                      onChange={(event) => {
                        markFissionCustom();
                        setFissionRotation(Number(event.target.value));
                      }}
                      className="mt-3 w-full accent-cyan-600"
                    />
                  </div>
                </div>
              </div>

              <div className={[
                "rounded-md border p-4 text-sm leading-6",
                isDark ? "border-cyan-300/15 bg-cyan-400/10 text-cyan-100" : "border-cyan-200 bg-cyan-50 text-cyan-800",
              ].join(" ")}>
                {t("快速裂变只做本地机械变换，不调用 AI；多次裂变会把同一张图拆成多条 worker 任务，一次生成多张相似但不同的结果。透明底默认输出 PNG。", "Quick fission only performs local mechanical transforms without AI. Entropy fission creates multiple worker items for the same image, producing several similar but different outputs. Transparent backgrounds always output PNG.")}
              </div>
            </div>

            <div className={[
              "flex shrink-0 justify-end gap-3 border-t px-5 py-4 sm:px-6",
              isDark ? "border-white/[0.08] bg-[#0f0f10]" : "border-zinc-200 bg-white",
            ].join(" ")}>
              <button
                type="button"
                onClick={closeFissionDialog}
                disabled={isFissionRunning}
                className={[
                  "rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                  isDark ? "border-white/[0.12] text-zinc-200 hover:bg-white/[0.06]" : "border-zinc-300 text-zinc-800 hover:bg-zinc-100",
                ].join(" ")}
              >
                {t("取消", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void startFissionJob()}
                disabled={isFissionRunning || fissionTargetCount === 0}
                className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isFissionRunning ? t("快速裂变处理中...", "Processing...") : fissionTargetAssetIds ? t("开始单张快速裂变", "Start Single Quick Fission") : t("开始快速裂变", "Start Quick Fission")}
              </button>
            </div>
          </div>
        </div>
      ), document.body) : null}

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
                {showFissionComparison ? (
                  <div className="grid h-full min-h-[260px] w-full gap-3 lg:grid-cols-2">
                    <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-md bg-zinc-100">
                      <img
                        src={getDisplayImageSrc(getFissionInputUrl(selectedAsset))}
                        alt={selectedAsset.filename}
                        decoding="async"
                        className="max-h-[70vh] w-full object-contain"
                      />
                      <span className="absolute left-3 top-3 rounded-md bg-black/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                        {t("\u539f\u56fe", "Original")}
                      </span>
                    </div>
                    <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-md bg-white bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0]">
                      {selectedAsset.processed_url ? (
                        <img
                          src={getDisplayImageSrc(selectedAsset.processed_url)}
                          alt={selectedAsset.filename}
                          decoding="async"
                          className="max-h-[70vh] w-full object-contain p-3"
                        />
                      ) : (
                        <span className="px-4 text-center text-sm font-medium text-zinc-500">
                          {t("\u6682\u65e0\u88c2\u53d8\u7ed3\u679c", "No fission result yet")}
                        </span>
                      )}
                      <span className="absolute left-3 top-3 rounded-md bg-cyan-700/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                        {t("\u7ed3\u679c\u56fe", "Result")}
                      </span>
                    </div>
                  </div>
                ) : (
                <img
                  src={getDisplayImageSrc(getAssetPreviewUrl(selectedAsset))}
                  alt={selectedAsset.filename}
                  decoding="async"
                  className="max-h-[70vh] w-full object-contain"
                />
                )}
                <div className={["absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-end gap-2 border-t p-3 backdrop-blur", isDark ? "border-white/[0.08] bg-black/60" : "border-zinc-200 bg-white/85"].join(" ")}>
                  {showFissionComparison ? (
                    <button
                      type="button"
                      onClick={() => openSingleFissionDialog(selectedAsset.id)}
                      disabled={isBatchProcessing || isDeleting}
                      className="rounded-md bg-cyan-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
                    >
                      {t("裂变此图", "Fission This Image")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void downloadAsset(selectedAsset)}
                    className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
                  >
                    {showFissionComparison && selectedAsset.processed_url ? t("下载结果", "Download Result") : t("下载", "Download")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([selectedAsset.id])}
                    disabled={isDeleting || isBatchProcessing}
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
                    disabled={isDeleting || isBatchProcessing}
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
