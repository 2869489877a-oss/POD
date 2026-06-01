"use client";

import { useMemo, useState } from "react";

import { fetchAssetsAction } from "@/lib/actions/assets";
import {
  resizePresets,
  type ResizePresetKey,
} from "@/lib/image-processing/resize-presets";

type AssetStatus = "uploaded" | "processing" | "processed" | "failed";
type CopyrightStatus = "unknown" | "owned" | "commercial_ok" | "risky" | "forbidden";

export type Asset = {
  copyright_status: CopyrightStatus;
  created_at: string;
  file_size: number;
  filename: string;
  format: string;
  height: number;
  id: string;
  original_url: string;
  processed_url: string | null;
  source: string;
  status: AssetStatus;
  updated_at: string;
  width: number;
};

type AssetsResponse = {
  assets?: Asset[];
  error?: string;
};

type DeleteAssetsResponse = {
  error?: string;
  failed_count?: number;
  message?: string;
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

const statusOptions: Array<{ label: string; value: "all" | AssetStatus }> = [
  { label: "全部状态", value: "all" },
  { label: "已上传", value: "uploaded" },
  { label: "处理中", value: "processing" },
  { label: "已处理", value: "processed" },
  { label: "失败", value: "failed" },
];

const copyrightOptions: Array<{ label: string; value: "all" | CopyrightStatus }> = [
  { label: "全部版权", value: "all" },
  { label: "未知", value: "unknown" },
  { label: "自有", value: "owned" },
  { label: "可商用", value: "commercial_ok" },
  { label: "有风险", value: "risky" },
  { label: "禁用", value: "forbidden" },
];

const statusLabels: Record<AssetStatus, string> = {
  failed: "失败",
  processed: "已处理",
  processing: "处理中",
  uploaded: "已上传",
};

const copyrightLabels: Record<CopyrightStatus, string> = {
  commercial_ok: "可商用",
  forbidden: "禁用",
  owned: "自有",
  risky: "有风险",
  unknown: "未知",
};

const statusStyles: Record<AssetStatus, string> = {
  failed: "bg-red-50 text-red-700",
  processed: "bg-emerald-50 text-emerald-700",
  processing: "bg-amber-50 text-amber-700",
  uploaded: "bg-sky-50 text-sky-700",
};

const resizePresetOptions: ResizePresetKey[] = ["tshirt-print", "square-product"];

const resizeJobStatusLabels: Record<ResizeJobStatus, string> = {
  completed: "已完成",
  failed: "失败",
  partial_failed: "部分失败",
  pending: "等待处理",
  processing: "处理中",
};

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildAssetQuery(status: string, copyrightStatus: string) {
  const params = new URLSearchParams();

  if (status !== "all") {
    params.set("status", status);
  }

  if (copyrightStatus !== "all") {
    params.set("copyright_status", copyrightStatus);
  }

  const queryString = params.toString();
  return queryString ? `/api/assets?${queryString}` : "/api/assets";
}

export function AssetsGallery({ initialAssets, initialError = null }: AssetsGalleryProps) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [status, setStatus] = useState<"all" | AssetStatus>("all");
  const [copyrightStatus, setCopyrightStatus] = useState<"all" | CopyrightStatus>("all");
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
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const selectedCount = selectedIds.size;
  const totalPages = Math.ceil(total / 24);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds],
  );
  const resizeCompletedCount = resizeJob
    ? resizeJob.success_count + resizeJob.failed_count
    : 0;
  const resizeProgressPercent =
    resizeJob && resizeJob.total_count > 0
      ? Math.round((resizeCompletedCount / resizeJob.total_count) * 100)
      : 0;
  const failedResizeItems = resizeJob?.items.filter((item) => item.status === "failed") ?? [];

  async function fetchAssets(
    nextStatus: "all" | AssetStatus = status,
    nextCopyrightStatus: "all" | CopyrightStatus = copyrightStatus,
    nextPage: number = page,
  ) {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchAssetsAction(nextStatus, nextCopyrightStatus, nextPage);

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
      setError(requestError instanceof Error ? requestError.message : "读取素材失败");
      setAssets([]);
      setSelectedIds(new Set());
    } finally {
      setIsLoading(false);
    }
  }

  function handleStatusChange(nextStatus: "all" | AssetStatus) {
    setStatus(nextStatus);
    setPage(1);
    void fetchAssets(nextStatus, copyrightStatus, 1);
  }

  function handleCopyrightStatusChange(nextCopyrightStatus: "all" | CopyrightStatus) {
    setCopyrightStatus(nextCopyrightStatus);
    setPage(1);
    void fetchAssets(status, nextCopyrightStatus, 1);
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
      setError("请选择要删除的素材");
      return;
    }

    setIsDeleting(true);
    setError(null);
    setDeleteMessage(null);

    try {
      const checkResponse = await fetch("/api/assets", {
        body: JSON.stringify({
          asset_ids: assetIds,
          dry_run: true,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      const checkData = (await checkResponse.json()) as DeleteAssetsResponse;

      if (!checkResponse.ok) {
        throw new Error(checkData.error ?? "删除检查失败");
      }

      const confirmed = window.confirm(
        checkData.requires_confirmation
          ? "该素材已被使用，删除可能影响商品草稿，是否继续？"
          : `确认删除 ${assetIds.length} 张素材？`,
      );

      if (!confirmed) {
        return;
      }

      const response = await fetch("/api/assets", {
        body: JSON.stringify({
          asset_ids: assetIds,
          force: checkData.requires_confirmation === true,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      const data = (await response.json()) as DeleteAssetsResponse;
      const failedResults = (data.results ?? []).filter((result) => !result.success);

      if (!response.ok && (data.results ?? []).length === 0) {
        throw new Error(data.error ?? "删除素材失败");
      }

      setDeleteMessage(`删除成功 ${data.success_count ?? 0} 张，失败 ${data.failed_count ?? 0} 张`);

      if (failedResults.length > 0) {
        setError(failedResults.map((result) => `${result.filename ?? result.asset_id}：${result.error ?? "删除失败"}`).join("\n"));
      }

      setSelectedIds((current) => {
        const deletedIds = new Set((data.results ?? []).filter((result) => result.success).map((result) => result.asset_id));
        return new Set(Array.from(current).filter((id) => !deletedIds.has(id)));
      });

      if (selectedAsset && assetIds.includes(selectedAsset.id)) {
        setSelectedAsset(null);
      }

      await fetchAssets(status, copyrightStatus);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除素材失败");
    } finally {
      setIsDeleting(false);
    }
  }

  async function fetchResizeJob(jobId: string) {
    const response = await fetch(`/api/image-jobs/${jobId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as ResizeJobResponse;

    if (!response.ok || !data.job) {
      throw new Error(data.error ?? "读取任务进度失败");
    }

    return data.job;
  }

  async function startResizeJob() {
    const assetIds = Array.from(selectedIds);
    let pollTimer: number | undefined;

    if (assetIds.length === 0) {
      setResizeError("请先选择要处理的图片");
      return;
    }

    setIsResizeRunning(true);
    setResizeError(null);
    setResizeMessage("正在创建批量改尺寸任务...");
    setResizeJob(null);

    try {
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
        throw new Error(createData.error ?? "任务创建失败");
      }

      const jobId = createData.job.id;
      setResizeJob({
        ...createData.job,
        items: [],
      });
      setResizeMessage("任务已创建，正在同步处理图片...");
      setIsResizeDialogOpen(false);

      pollTimer = window.setInterval(() => {
        void fetchResizeJob(jobId)
          .then((job) => setResizeJob(job))
          .catch(() => undefined);
      }, 1000);

      const processResponse = await fetch(`/api/image-jobs/${jobId}`, {
        method: "POST",
      });
      const processData = (await processResponse.json()) as ResizeJobResponse;

      if (!processResponse.ok || !processData.job) {
        throw new Error(processData.error ?? "任务处理失败");
      }

      setResizeJob(processData.job);
      setResizeMessage("批量改尺寸任务处理完成");
      await fetchAssets(status, copyrightStatus);
    } catch (requestError) {
      setResizeError(requestError instanceof Error ? requestError.message : "任务处理失败");
      setResizeMessage(null);
    } finally {
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }

      setIsResizeRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label htmlFor="asset-status" className="block text-sm font-medium text-zinc-950">
              状态
            </label>
            <select
              id="asset-status"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value as "all" | AssetStatus)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="copyright-status" className="block text-sm font-medium text-zinc-950">
              版权状态
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
                  {option.label}
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
              ? "取消全选"
              : "全选当前"}
          </button>

          <button
            type="button"
            onClick={() => void fetchAssets(status, copyrightStatus)}
            disabled={isLoading}
            className="self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isLoading ? "刷新中..." : "刷新列表"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>共 {assets.length} 张素材</span>
          <span>已选择 {selectedCount} 张</span>
          {selectedAssets.length > 0 ? (
            <span className="text-zinc-500">
              最近选择：{selectedAssets.slice(0, 3).map((asset) => asset.filename).join("、")}
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
            批量改尺寸
          </button>
          <button
            type="button"
            onClick={() => void deleteAssetIds(Array.from(selectedIds))}
            disabled={selectedCount === 0 || isDeleting || isResizeRunning}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
          >
            {isDeleting ? "删除中..." : "批量删除"}
          </button>
          <span className="text-sm text-zinc-500">会基于原图生成处理后图片，不覆盖原图。</span>
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
              <h3 className="text-base font-semibold text-zinc-950">批量改尺寸进度</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {resizeMessage ?? "等待任务结果"}
              </p>
            </div>
            {resizeJob ? (
              <span className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">
                {resizeJobStatusLabels[resizeJob.status]}
              </span>
            ) : null}
          </div>

          {resizeJob ? (
            <div className="mt-4 space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${resizeProgressPercent}%` }}
                />
              </div>
              <div className="grid gap-3 text-sm text-zinc-600 sm:grid-cols-4">
                <span>总数：{resizeJob.total_count}</span>
                <span>已完成：{resizeCompletedCount}</span>
                <span>成功：{resizeJob.success_count}</span>
                <span>失败：{resizeJob.failed_count}</span>
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
                失败原因
              </div>
              <div className="divide-y divide-red-100">
                {failedResizeItems.map((item) => (
                  <div key={item.id} className="px-4 py-2 text-sm text-red-700">
                    {item.error_message ?? "未知错误"}
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

      {isLoading ? (
        <div className="rounded-md border border-zinc-200 bg-white p-8 text-sm text-zinc-500">
          正在加载素材...
        </div>
      ) : null}

      {!isLoading && !error && assets.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8">
          <p className="text-sm font-medium text-zinc-950">暂无素材</p>
          <p className="mt-2 text-sm text-zinc-600">请先在上传页面添加图片，或调整筛选条件。</p>
        </div>
      ) : null}

      {!isLoading && assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            const previewUrl = asset.processed_url ?? asset.original_url;

            return (
              <article
                key={asset.id}
                className={[
                  "overflow-hidden rounded-md border bg-white transition",
                  isSelected ? "border-zinc-950 ring-2 ring-zinc-950/10" : "border-zinc-200",
                ].join(" ")}
              >
                <div className="relative aspect-[4/3] bg-zinc-100">
                  <button
                    type="button"
                    onClick={() => setSelectedAsset(asset)}
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url("${previewUrl}")` }}
                    aria-label={`查看 ${asset.filename} 详情`}
                  />
                  <label className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-800 shadow-sm">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleAsset(asset.id)}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    选择
                  </label>
                  <span
                    className={[
                      "absolute right-3 top-3 rounded-md px-2.5 py-1 text-xs font-medium",
                      statusStyles[asset.status],
                    ].join(" ")}
                  >
                    {statusLabels[asset.status]}
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
                      <dt className="text-zinc-500">版权状态</dt>
                      <dd className="mt-1 font-medium text-zinc-800">
                        {copyrightLabels[asset.copyright_status]}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">创建时间</dt>
                      <dd className="mt-1 font-medium text-zinc-800">
                        {formatDate(asset.created_at)}
                      </dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={() => setSelectedAsset(asset)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([asset.id])}
                    disabled={isDeleting || isResizeRunning}
                    className="w-full rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                  >
                    删除素材
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => { const p = page - 1; setPage(p); void fetchAssets(status, copyrightStatus, p); }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-sm text-slate-600">
            第 {page} / {totalPages} 页（共 {total} 张）
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => { const p = page + 1; setPage(p); void fetchAssets(status, copyrightStatus, p); }}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {isResizeDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resize-dialog-title"
        >
          <div className="w-full max-w-2xl rounded-md bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-6 py-4">
              <h3 id="resize-dialog-title" className="text-base font-semibold text-zinc-950">
                批量改尺寸
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                已选择 {selectedCount} 张图片，处理结果会写入素材的 processed_url。
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
                        {preset.label}
                      </span>
                      <span className="mt-1 block text-sm text-zinc-600">
                        {preset.description}
                      </span>
                    </span>
                  </label>
                );
              })}

              <div className="rounded-md bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                当前只做尺寸标准化，不做抠图、高清化或套图。原图记录会保留，处理后图片会上传到
                Supabase Storage。
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsResizeDialogOpen(false)}
                disabled={isResizeRunning}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void startResizeJob()}
                disabled={isResizeRunning || selectedCount === 0}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isResizeRunning ? "处理中..." : "确认处理"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="asset-detail-title"
        >
          <div className="max-h-full w-full max-w-5xl overflow-y-auto rounded-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <div>
                <h3 id="asset-detail-title" className="text-base font-semibold text-zinc-950">
                  图片详情
                </h3>
                <p className="mt-1 text-sm text-zinc-500">{selectedAsset.filename}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
              >
                关闭
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.4fr_0.8fr]">
              <div
                className="min-h-[360px] rounded-md bg-zinc-100 bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${selectedAsset.original_url}")` }}
                role="img"
                aria-label={selectedAsset.filename}
              />

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-zinc-500">文件名</dt>
                  <dd className="mt-1 break-all font-medium text-zinc-950">
                    {selectedAsset.filename}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-zinc-500">尺寸</dt>
                    <dd className="mt-1 font-medium text-zinc-950">
                      {selectedAsset.width} x {selectedAsset.height}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">格式</dt>
                    <dd className="mt-1 font-medium text-zinc-950">
                      {selectedAsset.format.toUpperCase()}
                    </dd>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-zinc-500">文件大小</dt>
                    <dd className="mt-1 font-medium text-zinc-950">
                      {formatFileSize(selectedAsset.file_size)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">状态</dt>
                    <dd className="mt-1 font-medium text-zinc-950">
                      {statusLabels[selectedAsset.status]}
                    </dd>
                  </div>
                </div>
                <div>
                  <dt className="text-zinc-500">版权状态</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {copyrightLabels[selectedAsset.copyright_status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">创建时间</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {formatDate(selectedAsset.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">原图地址</dt>
                  <dd className="mt-1">
                    <a
                      href={selectedAsset.original_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      {selectedAsset.original_url}
                    </a>
                  </dd>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => void deleteAssetIds([selectedAsset.id])}
                    disabled={isDeleting || isResizeRunning}
                    className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                  >
                    {isDeleting ? "删除中..." : "删除素材"}
                  </button>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
