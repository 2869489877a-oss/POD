"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import {
  fetchImageJobs,
  fetchImageJobDetail,
  fetchImageJobSummary,
  recoverStaleWorkerQueues,
  requeueFailedWorkerQueues,
  retryImageJob,
} from "@/lib/actions/image-jobs";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";
import { getDisplayImageSrc } from "@/lib/local-asset-url";

const JOBS_PER_PAGE = 12;
const ITEMS_PER_PAGE = 8;

export type ImageJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial_failed";

export type ImageJob = {
  created_at: string;
  error_message: string | null;
  failed_count: number;
  id: string;
  job_type: "resize" | "fission" | "cutout" | "print_extraction" | "enhance" | "mockup" | "infringement_check";
  status: ImageJobStatus;
  success_count: number;
  total_count: number;
  updated_at: string;
};

type ImageJobItem = {
  asset_id: string;
  created_at: string;
  error_message: string | null;
  id: string;
  input_url: string;
  job_id: string;
  output_url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  updated_at: string;
};

type ImageJobDetail = ImageJob & {
  items: ImageJobItem[];
};

type ImageJobSummary = ImageJob & {
  item_status_counts?: {
    completed: number;
    failed: number;
    pending: number;
    processing: number;
  };
};

type WorkerJobType = Exclude<ImageJob["job_type"], "enhance"> | "export_images_zip" | "ai_generate_image" | "ai_split_grid" | "ai_apply_pattern";

type WorkerSlot = {
  asset_filename?: string | null;
  duration_ms?: number | null;
  item_id?: string | null;
  job_id?: string | null;
  job_type?: string | null;
  last_error?: string | null;
  stage?: string | null;
  started_at?: string | null;
  status?: string | null;
  updated_at?: string | null;
  worker_id: number | string;
};

type WorkerStatus = {
  blocked_job_types?: WorkerJobType[];
  expected_job_types?: WorkerJobType[];
  last_seen_seconds: number | null;
  missing_job_types?: WorkerJobType[];
  online: boolean;
  queue?: {
    active_jobs: number;
    failed: number;
    pending: number;
    processing: number;
  };
  queue_by_type?: Partial<Record<WorkerJobType, { failed: number; pending: number; processing: number }>>;
  ready?: boolean;
  stale_after_seconds: number;
  state_file?: string;
  worker: {
    concurrency: number | null;
    job_type_limits?: Partial<Record<WorkerJobType, number>>;
    job_types: string[];
    slots: WorkerSlot[];
    started_at: string | null;
    updated_at: string | null;
    worker: string;
  } | null;
  worker_jobs?: ImageJob[];
};

type ImageJobsCenterProps = {
  initialError?: string | null;
  initialJobs: ImageJob[];
};

const jobTypeLabels: Record<ImageJob["job_type"], { zh: string; en: string }> = {
  cutout: { zh: "一键抠图", en: "One-click Cutout" },
  enhance: { zh: "图片增强", en: "Image Enhance" },
  fission: { zh: "图片裂变", en: "Image Fission" },
  infringement_check: { zh: "侵权检测", en: "IP Check" },
  mockup: { zh: "套图生成", en: "Mockup Render" },
  print_extraction: { zh: "印花提取", en: "Print Extract" },
  resize: { zh: "批量改尺寸", en: "Batch Resize" },
};

const workerJobTypeLabels: Record<WorkerJobType, { zh: string; en: string }> = {
  ai_apply_pattern: { zh: "AI 贴图", en: "AI Apply Pattern" },
  ai_generate_image: { zh: "AI 生图", en: "AI Image" },
  ai_split_grid: { zh: "AI 拆图", en: "AI Split Grid" },
  cutout: jobTypeLabels.cutout,
  export_images_zip: { zh: "图片 ZIP 导出", en: "Image ZIP Export" },
  fission: jobTypeLabels.fission,
  infringement_check: jobTypeLabels.infringement_check,
  mockup: jobTypeLabels.mockup,
  print_extraction: jobTypeLabels.print_extraction,
  resize: jobTypeLabels.resize,
};

const statusLabels: Record<ImageJobStatus, { zh: string; en: string }> = {
  completed: { zh: "全部完成", en: "All Done" },
  failed: { zh: "全部失败", en: "All Failed" },
  partial_failed: { zh: "部分失败", en: "Partial Failed" },
  pending: { zh: "排队中", en: "Queued" },
  processing: { zh: "正在处理", en: "Processing" },
};

const statusHints: Record<ImageJobStatus, { zh: string; en: string }> = {
  completed: {
    zh: "全部图片已处理完成，可以查看结果或下载。",
    en: "All images are finished. Results are ready to view or download.",
  },
  failed: {
    zh: "所有图片都失败了，点开详情查看失败原因后再重试。",
    en: "Every image failed. Open details to review errors before retrying.",
  },
  partial_failed: {
    zh: "有些图片成功，有些失败；可以只重试失败项。",
    en: "Some images succeeded and some failed. Retry failed items only.",
  },
  pending: {
    zh: "任务已提交，正在等待后台服务领取。",
    en: "Submitted and waiting for the background worker.",
  },
  processing: {
    zh: "后台服务正在处理，进度会自动刷新。",
    en: "The background worker is processing it now. Progress refreshes automatically.",
  },
};

const itemStatusLabels: Record<ImageJobItem["status"], { zh: string; en: string }> = {
  completed: { zh: "成功", en: "Done" },
  failed: { zh: "失败", en: "Failed" },
  pending: { zh: "等待", en: "Waiting" },
  processing: { zh: "处理中", en: "Processing" },
};

const itemStatusHints: Record<ImageJobItem["status"], { zh: string; en: string }> = {
  completed: { zh: "这张图片已经处理成功。", en: "This image finished successfully." },
  failed: { zh: "这张图片处理失败，下方会显示原因。", en: "This image failed. The reason appears below." },
  pending: { zh: "这张图片还在排队等待处理。", en: "This image is waiting in the queue." },
  processing: { zh: "这张图片正在处理中。", en: "This image is being processed." },
};

const workerStageLabels: Record<string, { zh: string; en: string }> = {
  claiming: { zh: "领取任务", en: "Claiming" },
  completed: { zh: "刚完成", en: "Completed" },
  downloading: { zh: "下载图片", en: "Downloading" },
  failed: { zh: "失败", en: "Failed" },
  idle: { zh: "空闲", en: "Idle" },
  processing: { zh: "处理图片", en: "Processing" },
  saving: { zh: "保存结果", en: "Saving" },
};

const statusStyles: Record<ImageJobStatus | ImageJobItem["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  partial_failed: "bg-amber-50 text-amber-700",
  pending: "bg-zinc-100 text-zinc-700",
  processing: "bg-sky-50 text-sky-700",
};

const statusVisualStyles: Record<ImageJobStatus, { color: string; soft: string }> = {
  completed: { color: "#10b981", soft: "#d1fae5" },
  failed: { color: "#ef4444", soft: "#fee2e2" },
  partial_failed: { color: "#f59e0b", soft: "#fef3c7" },
  pending: { color: "#71717a", soft: "#e4e4e7" },
  processing: { color: "#0ea5e9", soft: "#e0f2fe" },
};

const queueVisualStyles = {
  failed: { color: "#ef4444", label: { zh: "失败待处理", en: "Failed" } },
  pending: { color: "#71717a", label: { zh: "排队中", en: "Queued" } },
  processing: { color: "#0ea5e9", label: { zh: "处理中", en: "Processing" } },
} as const;

const statusChartOrder: ImageJobStatus[] = ["pending", "processing", "completed", "partial_failed", "failed"];
const jobTypeOptions: Array<"all" | ImageJob["job_type"]> = ["all", "infringement_check", "print_extraction", "cutout", "resize", "fission", "enhance", "mockup"];
const jobStatusOptions: Array<"all" | ImageJobStatus> = ["all", "processing", "partial_failed", "failed", "completed", "pending"];

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(id: string) {
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

function doneCount(job: Pick<ImageJob, "failed_count" | "success_count">) {
  return job.success_count + job.failed_count;
}

function progressPercent(job: Pick<ImageJob, "failed_count" | "success_count" | "total_count">) {
  if (job.total_count <= 0) return 0;
  return Math.min(100, Math.round((doneCount(job) / job.total_count) * 100));
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function isActiveJobStatus(status: ImageJobStatus | ImageJobItem["status"]) {
  return status === "pending" || status === "processing";
}

function countItemsByStatus(items: ImageJobItem[]) {
  return items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { completed: 0, failed: 0, pending: 0, processing: 0 },
  );
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "n/a";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function formatJobTypeList(
  jobTypes: string[],
  t: (zh: string, en: string) => string,
) {
  if (jobTypes.length === 0) {
    return "-";
  }

  return jobTypes
    .map((jobType) => {
      return formatWorkerJobType(jobType, t);
    })
    .join(" / ");
}

function formatWorkerJobType(jobType: string, t: (zh: string, en: string) => string) {
  const label = workerJobTypeLabels[jobType as WorkerJobType];
  return label ? t(label.zh, label.en) : jobType;
}

function formatWorkerStage(slot: WorkerSlot, t: (zh: string, en: string) => string) {
  const stage = slot.stage ?? slot.status ?? "idle";
  const label = workerStageLabels[stage];
  return label ? t(label.zh, label.en) : stage;
}

export function ImageJobsCenter({ initialError = null, initialJobs }: ImageJobsCenterProps) {
  const { language, t } = useSettings();
  const [jobs, setJobs] = useState<ImageJob[]>(initialJobs);
  const [selectedJob, setSelectedJob] = useState<ImageJobDetail | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  const [jobTypeFilter, setJobTypeFilter] = useState<"all" | ImageJob["job_type"]>("all");
  const [jobStatusFilter, setJobStatusFilter] = useState<"all" | ImageJobStatus>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [retryTargetIds, setRetryTargetIds] = useState<string[]>([]);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [workerStatusError, setWorkerStatusError] = useState<string | null>(null);
  const [isWorkerStatusRefreshing, setIsWorkerStatusRefreshing] = useState(false);
  const [isMaintainingWorkerQueue, setIsMaintainingWorkerQueue] = useState(false);
  const [jobsPage, setJobsPage] = useState(1);
  const [itemsPage, setItemsPage] = useState(1);

  const visibleItems = useMemo(() => {
    if (!selectedJob) {
      return [];
    }

    return failedOnly
      ? selectedJob.items.filter((item) => item.status === "failed")
      : selectedJob.items;
  }, [failedOnly, selectedJob]);
  const failedItems = selectedJob?.items.filter((item) => item.status === "failed") ?? [];
  const selectedJobItemStats = useMemo(
    () => countItemsByStatus(selectedJob?.items ?? []),
    [selectedJob],
  );
  const currentProcessingItems = useMemo(
    () => selectedJob?.items.filter((item) => item.status === "processing") ?? [],
    [selectedJob],
  );
  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (jobTypeFilter !== "all" && job.job_type !== jobTypeFilter) return false;
      if (jobStatusFilter !== "all" && job.status !== jobStatusFilter) return false;
      return true;
    });
  }, [jobStatusFilter, jobTypeFilter, jobs]);
  const jobStats = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.total += 1;
        acc.items += job.total_count;
        acc.success += job.success_count;
        acc.failed += job.failed_count;
        acc.done += doneCount(job);
        if (job.status === "processing" || job.status === "pending") acc.running += 1;
        return acc;
      },
      { done: 0, failed: 0, items: 0, running: 0, success: 0, total: 0 },
    );
  }, [jobs]);
  const statusDistribution = useMemo(() => {
    return statusChartOrder.map((status) => {
      const matchingJobs = jobs.filter((job) => job.status === status);
      return {
        images: matchingJobs.reduce((sum, job) => sum + job.total_count, 0),
        jobs: matchingJobs.length,
        status,
      };
    });
  }, [jobs]);
  const maxStatusJobs = Math.max(1, ...statusDistribution.map((item) => item.jobs));
  const typeDistribution = useMemo(() => {
    return (Object.keys(jobTypeLabels) as ImageJob["job_type"][])
      .map((jobType) => {
        const matchingJobs = jobs.filter((job) => job.job_type === jobType);
        return {
          images: matchingJobs.reduce((sum, job) => sum + job.total_count, 0),
          jobs: matchingJobs.length,
          jobType,
        };
      })
      .filter((item) => item.jobs > 0 || item.images > 0)
      .sort((left, right) => right.images - left.images || right.jobs - left.jobs);
  }, [jobs]);
  const maxTypeImages = Math.max(1, ...typeDistribution.map((item) => item.images));
  const retryProgress = useMemo(() => {
    if (!selectedJob || retryTargetIds.length === 0) {
      return null;
    }

    const retryItems = selectedJob.items.filter((item) => retryTargetIds.includes(item.id));
    const doneCount = retryItems.filter(
      (item) => item.status === "completed" || item.status === "failed",
    ).length;
    const percent = Math.round((doneCount / retryTargetIds.length) * 100);

    return {
      doneCount,
      percent,
      totalCount: retryTargetIds.length,
    };
  }, [retryTargetIds, selectedJob]);

  const jobsTotalPages = Math.max(1, Math.ceil(visibleJobs.length / JOBS_PER_PAGE));
  const currentJobsPage = Math.min(jobsPage, jobsTotalPages);
  const pagedJobs = useMemo(
    () => visibleJobs.slice((currentJobsPage - 1) * JOBS_PER_PAGE, currentJobsPage * JOBS_PER_PAGE),
    [visibleJobs, currentJobsPage],
  );
  const itemsTotalPages = Math.max(1, Math.ceil(visibleItems.length / ITEMS_PER_PAGE));
  const currentItemsPage = Math.min(itemsPage, itemsTotalPages);
  const pagedItems = useMemo(
    () => visibleItems.slice((currentItemsPage - 1) * ITEMS_PER_PAGE, currentItemsPage * ITEMS_PER_PAGE),
    [visibleItems, currentItemsPage],
  );
  const missingWorkerJobTypes = workerStatus?.missing_job_types ?? [];
  const blockedWorkerJobTypes = workerStatus?.blocked_job_types ?? [];
  const hasWorkerCoverageIssue = Boolean(workerStatus?.online && missingWorkerJobTypes.length > 0);
  const workerStatusClassName = hasWorkerCoverageIssue
    ? "bg-amber-50 text-amber-700"
    : workerStatus?.online
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";
  const workerQueueTypes = useMemo(() => {
    const rawTypes = [
      ...(workerStatus?.expected_job_types ?? []),
      ...(workerStatus?.worker?.job_types ?? []),
      ...Object.keys(workerStatus?.queue_by_type ?? {}),
    ];

    return Array.from(new Set(rawTypes)).filter(Boolean) as WorkerJobType[];
  }, [workerStatus?.expected_job_types, workerStatus?.queue_by_type, workerStatus?.worker?.job_types]);
  const queueVisualRows = useMemo(
    () =>
      (["pending", "processing", "failed"] as const).map((key) => ({
        key,
        value: workerStatus?.queue?.[key] ?? 0,
        ...queueVisualStyles[key],
      })),
    [workerStatus?.queue],
  );
  const maxQueueValue = Math.max(1, ...queueVisualRows.map((item) => item.value));
  const processedPercent = percent(jobStats.done, jobStats.items);
  const successPercent = percent(jobStats.success, jobStats.done);
  const workerLoadPercent = percent(workerStatus?.queue?.processing ?? 0, workerStatus?.worker?.concurrency ?? 0);
  const recentJobFlow = jobs.slice(0, 12);

  async function refreshWorkerStatus(showLoading = false) {
    if (showLoading) {
      setIsWorkerStatusRefreshing(true);
    }

    try {
      const response = await fetch("/api/local-worker/status", { cache: "no-store" });
      const data = (await response.json()) as WorkerStatus & { error?: string; ok?: boolean };

      if (!response.ok || data.error) {
        throw new Error(data.error ?? t("读取 worker 状态失败", "Failed to read worker status"));
      }

      setWorkerStatus(data);
      setWorkerStatusError(null);
    } catch (requestError) {
      setWorkerStatusError(requestError instanceof Error ? requestError.message : t("读取 worker 状态失败", "Failed to read worker status"));
    } finally {
      if (showLoading) {
        setIsWorkerStatusRefreshing(false);
      }
    }
  }

  async function refreshJobs() {
    setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchImageJobs();
      if (data.error) throw new Error(data.error);
      setJobs(data.jobs as ImageJob[]);

      if (selectedJob) {
        await loadJobSummary(selectedJob.id);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取任务列表失败", "Failed to load jobs"));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function loadJobDetail(jobId: string, showLoading = true, resetFilter = true) {
    if (showLoading) {
      setIsDetailLoading(true);
    }

    setDetailError(null);

    try {
      const data = await fetchImageJobDetail(jobId);
      if (data.error || !data.job) throw new Error(data.error ?? t("读取任务明细失败", "Failed to load job detail"));

      setSelectedJob(data.job as ImageJobDetail);
      if (resetFilter) {
        setFailedOnly(false);
      }
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : t("读取任务明细失败", "Failed to load job detail"));
    } finally {
      if (showLoading) {
        setIsDetailLoading(false);
      }
    }
  }

  async function loadJobSummary(jobId: string) {
    const data = await fetchImageJobSummary(jobId);
    if (data.error || !data.job) throw new Error(data.error ?? t("读取任务进度失败", "Failed to load job progress"));

    const summary = data.job as ImageJobSummary;
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, ...summary } : job)));
    setSelectedJob((current) => (current?.id === jobId ? { ...current, ...summary } : current));

    if (!isActiveJobStatus(summary.status)) {
      await loadJobDetail(jobId, false, false);
    }
  }

  async function retryFailedItems(itemIds?: string[]) {
    if (!selectedJob) {
      setDetailError(t("请选择一个图片处理任务", "Please select an image processing job"));
      return;
    }

    const targetIds = itemIds && itemIds.length > 0 ? itemIds : failedItems.map((item) => item.id);

    if (targetIds.length === 0) {
      setDetailError(t("当前任务没有失败项可重新执行", "This job has no failed items to retry"));
      return;
    }

    setIsRetrying(true);
    setRetryTargetIds(targetIds);
    setDetailError(null);
    setMessage(t(`正在重新执行 ${targetIds.length} 个失败项...`, `Retrying ${targetIds.length} failed item(s)...`));
    setSelectedJob((current) =>
      current
        ? {
            ...current,
            status: "processing",
            items: current.items.map((item) =>
              targetIds.includes(item.id)
                ? {
                    ...item,
                    error_message: null,
                    output_url: null,
                    status: "pending",
                  }
                : item,
            ),
          }
        : current,
    );

    const pollTimer = window.setInterval(() => {
      void loadJobSummary(selectedJob.id).catch(() => undefined);
    }, 1000);

    try {
      const data = await retryImageJob(selectedJob.id, targetIds);
      if (data.error) throw new Error(data.error);

      setMessage(t("重新执行任务已提交", "Retry job submitted"));
      await refreshJobs();
      await loadJobDetail(selectedJob.id, false, false);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : t("重新执行失败任务失败", "Failed to retry failed items"));
    } finally {
      window.clearInterval(pollTimer);
      setIsRetrying(false);
      setRetryTargetIds([]);
    }
  }

  async function maintainWorkerQueue(mode: "recover_stale" | "requeue_failed") {
    setIsMaintainingWorkerQueue(true);
    setWorkerStatusError(null);
    setMessage(null);

    try {
      const data =
        mode === "recover_stale"
          ? await recoverStaleWorkerQueues()
          : await requeueFailedWorkerQueues();

      if (data.error) {
        throw new Error(data.error);
      }

      const changedCount = mode === "recover_stale" ? (data.recovered ?? 0) : (data.requeued ?? 0);
      setMessage(
        mode === "recover_stale"
          ? t(`已恢复 ${changedCount} 个卡住任务`, `Recovered ${changedCount} stale queue item(s)`)
          : t(`已重新排队 ${changedCount} 个失败任务`, `Requeued ${changedCount} failed queue item(s)`),
      );

      await Promise.all([refreshWorkerStatus(true), refreshJobs()]);
    } catch (requestError) {
      setWorkerStatusError(
        requestError instanceof Error
          ? requestError.message
          : mode === "recover_stale"
            ? t("恢复卡住任务失败", "Failed to recover stale jobs")
            : t("重新排队失败任务失败", "Failed to requeue failed jobs"),
      );
    } finally {
      setIsMaintainingWorkerQueue(false);
    }
  }

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshWorkerStatus();
    }, 0);
    const timer = window.setInterval(() => {
      void refreshWorkerStatus();

      const hasActiveJobs = jobs.some((job) => isActiveJobStatus(job.status));
      const hasActiveSelectedJob = selectedJob ? isActiveJobStatus(selectedJob.status) : false;
      const hasWorkerQueue = Boolean((workerStatus?.queue?.pending ?? 0) + (workerStatus?.queue?.processing ?? 0));

      if (hasActiveJobs || hasActiveSelectedJob || hasWorkerQueue || isRetrying) {
        void refreshJobs();
      }
    }, 3000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, selectedJob, workerStatus?.queue?.pending, workerStatus?.queue?.processing, isRetrying]);

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("图形看板", "Visual Dashboard")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t("用图形快速观察任务调用、队列压力和成功失败情况。", "Quickly observe calls, queue pressure, and success/failure status.")}
            </p>
          </div>
          <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
            {t(`最近 ${jobs.length} 个任务`, `Latest ${jobs.length} jobs`)}
          </span>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[1.05fr_1.25fr_1fr]">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("总体完成度", "Overall Progress")}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {t(`已处理 ${jobStats.done} / ${jobStats.items} 张`, `${jobStats.done} / ${jobStats.items} images processed`)}
                </p>
              </div>
              <div className="relative h-28 w-28 shrink-0">
                <svg viewBox="0 0 108 108" className="h-28 w-28" aria-label={t("总体完成度圆环", "Overall progress ring")}>
                  <circle cx="54" cy="54" r="42" fill="none" stroke="#e4e4e7" strokeWidth="10" />
                  <circle
                    cx="54"
                    cy="54"
                    r="42"
                    fill="none"
                    pathLength={100}
                    stroke="#10b981"
                    strokeDasharray={`${processedPercent} ${100 - processedPercent}`}
                    strokeLinecap="round"
                    strokeWidth="10"
                    transform="rotate(-90 54 54)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-zinc-950">{processedPercent}%</span>
                  <span className="text-[11px] text-zinc-500">{t("已处理", "Done")}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md bg-white px-3 py-2">
                <p className="text-zinc-500">{t("成功率", "Success")}</p>
                <p className="mt-1 text-lg font-semibold text-emerald-700">{successPercent}%</p>
              </div>
              <div className="rounded-md bg-white px-3 py-2">
                <p className="text-zinc-500">{t("进行中", "Active")}</p>
                <p className="mt-1 text-lg font-semibold text-sky-700">{jobStats.running}</p>
              </div>
              <div className="rounded-md bg-white px-3 py-2">
                <p className="text-zinc-500">{t("失败图", "Failed")}</p>
                <p className="mt-1 text-lg font-semibold text-red-700">{jobStats.failed}</p>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("任务状态分布", "Status Distribution")}</p>
                <p className="mt-1 text-xs text-zinc-500">{t("看任务主要卡在哪个阶段。", "See where jobs are concentrated.")}</p>
              </div>
              <span className="text-xs text-zinc-500">{t(`${jobStats.total} 个任务`, `${jobStats.total} jobs`)}</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
              {jobStats.total > 0 ? (
                <div className="flex h-full">
                  {statusDistribution.map((item) =>
                    item.jobs > 0 ? (
                      <div
                        key={item.status}
                        title={t(`${statusLabels[item.status].zh}：${item.jobs} 个任务`, `${statusLabels[item.status].en}: ${item.jobs} jobs`)}
                        style={{
                          backgroundColor: statusVisualStyles[item.status].color,
                          width: `${percent(item.jobs, jobStats.total)}%`,
                        }}
                      />
                    ) : null,
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {statusDistribution.map((item) => (
                <div key={item.status}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="inline-flex items-center gap-2 text-zinc-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusVisualStyles[item.status].color }} />
                      {t(statusLabels[item.status].zh, statusLabels[item.status].en)}
                    </span>
                    <span className="text-zinc-500">{item.jobs} / {item.images} {t("张", "img")}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        backgroundColor: statusVisualStyles[item.status].color,
                        width: `${item.jobs > 0 ? Math.max(6, percent(item.jobs, maxStatusJobs)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("后台队列压力", "Worker Queue Pressure")}</p>
                <p className="mt-1 text-xs text-zinc-500">{t("判断 worker 是否忙、是否积压。", "Check whether the worker is busy or backed up.")}</p>
              </div>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-zinc-700">
                {t(`负载 ${workerLoadPercent}%`, `${workerLoadPercent}% load`)}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {queueVisualRows.map((item) => (
                <div key={item.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="text-zinc-700">{t(item.label.zh, item.label.en)}</span>
                    <span className="font-semibold text-zinc-950">{item.value}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        backgroundColor: item.color,
                        width: `${item.value > 0 ? Math.max(6, percent(item.value, maxQueueValue)) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md bg-white px-3 py-2 text-xs text-zinc-500">
              {workerStatus?.online
                ? t(`当前可同时处理 ${workerStatus.worker?.concurrency ?? "-"} 个任务。`, `Can process ${workerStatus.worker?.concurrency ?? "-"} tasks at once.`)
                : t("后台服务未连接时，任务会停留在排队中。", "When the worker is offline, jobs stay queued.")}
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-zinc-200 p-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("任务类型调用量", "Calls by Task Type")}</p>
                <p className="mt-1 text-xs text-zinc-500">{t("哪类图片处理调用最多，一眼能看出来。", "See which task type is called most often.")}</p>
              </div>
            </div>
            {typeDistribution.length > 0 ? (
              <div className="mt-4 space-y-3">
                {typeDistribution.slice(0, 8).map((item) => (
                  <div key={item.jobType}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-zinc-700">{t(jobTypeLabels[item.jobType].zh, jobTypeLabels[item.jobType].en)}</span>
                      <span className="text-zinc-500">{item.jobs} {t("次", "calls")} / {item.images} {t("张", "images")}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-zinc-900 transition-all"
                        style={{ width: `${item.images > 0 ? Math.max(6, percent(item.images, maxTypeImages)) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
                {t("暂无任务类型数据。", "No task type data yet.")}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("最近调用流", "Recent Call Flow")}</p>
                <p className="mt-1 text-xs text-zinc-500">{t("越靠左越新，颜色代表当前状态。", "Newest on the left; color indicates status.")}</p>
              </div>
            </div>
            {recentJobFlow.length > 0 ? (
              <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">
                {recentJobFlow.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => {
                      setItemsPage(1);
                      void loadJobDetail(job.id);
                    }}
                    className="group flex flex-col items-center gap-2 rounded-md border border-zinc-200 bg-white p-2 transition hover:border-zinc-400 hover:bg-zinc-100"
                    title={t(`${jobTypeLabels[job.job_type].zh} / ${statusLabels[job.status].zh}`, `${jobTypeLabels[job.job_type].en} / ${statusLabels[job.status].en}`)}
                  >
                    <span
                      className="h-3 w-3 rounded-full transition group-hover:scale-125"
                      style={{ backgroundColor: statusVisualStyles[job.status].color }}
                    />
                    <span className="max-w-full truncate text-[10px] text-zinc-500">{t(jobTypeLabels[job.job_type].zh, jobTypeLabels[job.job_type].en)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
                {t("暂无最近调用。", "No recent calls yet.")}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ui-status-console rounded-md border border-zinc-200 bg-white">
        <div className="ui-console-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("后台处理服务", "Background Worker")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {workerStatus?.online
                ? hasWorkerCoverageIssue
                  ? t(
                      `服务在线，但还不能处理：${formatJobTypeList(missingWorkerJobTypes, t)}`,
                      `Online, but cannot process: ${formatJobTypeList(missingWorkerJobTypes, t)}`,
                    )
                  : t(`服务正常运行，最近 ${formatDuration(workerStatus.last_seen_seconds)} 前有心跳。`, `Running normally. Last heartbeat ${formatDuration(workerStatus.last_seen_seconds)} ago.`)
                : workerStatus?.worker
                  ? t(`服务可能离线，最近心跳在 ${formatDuration(workerStatus.last_seen_seconds)} 前。`, `Possibly offline. Last heartbeat ${formatDuration(workerStatus.last_seen_seconds)} ago.`)
                  : t("还没有读到后台服务心跳。", "No worker heartbeat found yet.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                workerStatusClassName,
              ].join(" ")}
            >
              {hasWorkerCoverageIssue ? t("需要配置", "Needs Config") : workerStatus?.online ? t("正常运行", "Online") : t("未连接", "Offline")}
            </span>
            <button
              type="button"
              onClick={() => void refreshWorkerStatus(true)}
              disabled={isWorkerStatusRefreshing}
              className="ui-press inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isWorkerStatusRefreshing ? (
                <>
                  <span className="ui-spinner ui-spinner-sm text-cyan-300" aria-hidden="true" />
                  <span>{t("刷新中...", "Refreshing...")}</span>
                </>
              ) : (
                t("刷新状态", "Refresh Status")
              )}
            </button>
            <button
              type="button"
              onClick={() => void maintainWorkerQueue("recover_stale")}
              disabled={isMaintainingWorkerQueue}
              className="ui-press rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-amber-300"
            >
              {isMaintainingWorkerQueue ? t("处理中...", "Processing...") : t("恢复卡住任务", "Recover Stuck")}
            </button>
            <button
              type="button"
              onClick={() => void maintainWorkerQueue("requeue_failed")}
              disabled={isMaintainingWorkerQueue || (workerStatus?.queue?.failed ?? 0) === 0}
              className="ui-press rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
            >
              {t("重新排队失败任务", "Requeue Failed")}
            </button>
          </div>
        </div>

        {workerStatusError ? (
          <div className="m-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {workerStatusError}
          </div>
        ) : null}

        {hasWorkerCoverageIssue ? (
          <div className="m-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">
              {t(
                `后台服务还没开启：${formatJobTypeList(missingWorkerJobTypes, t)}`,
                `Background worker is not enabled for: ${formatJobTypeList(missingWorkerJobTypes, t)}`,
              )}
            </p>
            <p className="mt-1 text-amber-700">
              {blockedWorkerJobTypes.length > 0
                ? t(
                    `这些任务会一直排队：${formatJobTypeList(blockedWorkerJobTypes, t)}。请在服务器 pod-ai-worker 环境变量里补全 LOCAL_IMAGE_WORKER_JOB_TYPES 后重启后台服务。`,
                    `These tasks can stay queued: ${formatJobTypeList(blockedWorkerJobTypes, t)}. Add LOCAL_IMAGE_WORKER_JOB_TYPES to pod-ai-worker and restart it.`,
                  )
                : t(
                    "请在服务器 pod-ai-worker 环境变量里补全 LOCAL_IMAGE_WORKER_JOB_TYPES，避免后续任务一直排队。",
                    "Add LOCAL_IMAGE_WORKER_JOB_TYPES to pod-ai-worker to prevent future jobs from staying queued.",
                  )}
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 border-b border-zinc-200 px-5 py-4 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-6">
          <div className="ui-metric-tile rounded-md bg-zinc-50 px-3 py-2">
            {t("同时处理：", "Concurrency: ")}<span className="font-semibold text-zinc-950">{workerStatus?.worker?.concurrency ?? "-"}</span>
          </div>
          <div className="ui-metric-tile rounded-md bg-zinc-50 px-3 py-2">
            {t("排队中：", "Queued: ")}<span className="font-semibold text-zinc-950">{workerStatus?.queue?.pending ?? 0}</span>
          </div>
          <div className="ui-metric-tile rounded-md bg-zinc-50 px-3 py-2">
            {t("处理中：", "Processing: ")}<span className="font-semibold text-zinc-950">{workerStatus?.queue?.processing ?? 0}</span>
          </div>
          <div className="ui-metric-tile rounded-md bg-zinc-50 px-3 py-2">
            {t("失败待处理：", "Failed: ")}<span className="font-semibold text-zinc-950">{workerStatus?.queue?.failed ?? 0}</span>
          </div>
          <div className="ui-metric-tile rounded-md bg-zinc-50 px-3 py-2">
            {t("进行中任务：", "Active Jobs: ")}<span className="font-semibold text-zinc-950">{workerStatus?.queue?.active_jobs ?? 0}</span>
          </div>
          <div className="ui-metric-tile rounded-md bg-zinc-50 px-3 py-2">
            {t("已开启功能：", "Enabled Types: ")}
            <span className="font-semibold text-zinc-950">
              {formatJobTypeList(workerStatus?.worker?.job_types ?? [], t)}
            </span>
          </div>
        </div>

        {workerQueueTypes.length > 0 ? (
          <div className="border-b border-zinc-200 px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-zinc-950">{t("各类任务排队情况", "Queue by Task Type")}</h4>
              <span className="text-xs text-zinc-500">{t("单类并发 / 排队 / 处理中 / 失败", "Limit / Queued / Running / Failed")}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {workerQueueTypes.map((jobType) => {
                const counts = workerStatus?.queue_by_type?.[jobType] ?? { failed: 0, pending: 0, processing: 0 };
                const limit = workerStatus?.worker?.job_type_limits?.[jobType] ?? "-";
                const isMissing = missingWorkerJobTypes.includes(jobType);
                const isBlocked = blockedWorkerJobTypes.includes(jobType);

                return (
                  <div
                    key={jobType}
                    className={[
                      "ui-queue-card rounded-md border px-3 py-2 text-sm",
                      isBlocked
                        ? "border-red-200 bg-red-50"
                        : isMissing
                          ? "border-amber-200 bg-amber-50"
                          : "border-zinc-200 bg-zinc-50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-zinc-950">{formatWorkerJobType(jobType, t)}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 text-xs text-zinc-600">
                        {isMissing ? t("未开启", "Disabled") : t("可处理", "Ready")}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-zinc-600">
                      <span>{t("并发", "Limit")}: <b className="text-zinc-950">{limit}</b></span>
                      <span>{t("排队", "Queued")}: <b className="text-zinc-950">{counts.pending}</b></span>
                      <span>{t("处理", "Running")}: <b className="text-zinc-950">{counts.processing}</b></span>
                      <span>{t("失败", "Failed")}: <b className="text-zinc-950">{counts.failed}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {workerStatus?.worker?.slots && workerStatus.worker.slots.length > 0 ? (
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {workerStatus.worker.slots.map((slot) => (
              <div key={slot.worker_id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-950">Worker {slot.worker_id}</span>
                  <span
                    className={[
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      slot.status === "processing"
                        ? "bg-sky-50 text-sky-700"
                        : slot.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : slot.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-zinc-100 text-zinc-700",
                    ].join(" ")}
                  >
                    {formatWorkerStage(slot, t)}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-zinc-500">
                  <p>{t("当前任务：", "Current task: ")}{slot.job_type ? `${formatWorkerJobType(slot.job_type, t)} / ${slot.item_id ? shortId(slot.item_id) : "-"}` : t("空闲", "Idle")}</p>
                  {slot.asset_filename ? <p className="truncate">{t("文件：", "File: ")}{slot.asset_filename}</p> : null}
                  {slot.duration_ms ? <p>{t("耗时：", "Duration: ")}{Math.round(slot.duration_ms / 1000)}s</p> : null}
                  {slot.last_error ? <p className="text-red-600">{slot.last_error}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5 text-sm text-zinc-500">{t("还没有后台 worker 运行状态。", "No worker slot information yet.")}</div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("图片任务", "Image Jobs")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t(`共 ${jobs.length} 个任务，点击任意任务查看每张图片的处理结果。`, `${jobs.length} jobs. Click any job to view image-level results.`)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshJobs()}
            disabled={isRefreshing}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isRefreshing ? t("刷新中...", "Refreshing...") : t("刷新状态", "Refresh Status")}
          </button>
        </div>

        <div className="grid gap-3 border-b border-zinc-200 px-5 py-4 text-sm text-zinc-600 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("任务总数：", "Jobs: ")}<span className="font-semibold text-zinc-950">{jobStats.total}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("处理中：", "Running: ")}<span className="font-semibold text-zinc-950">{jobStats.running}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("成功图片：", "Succeeded images: ")}<span className="font-semibold text-zinc-950">{jobStats.success}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("失败图片：", "Failed images: ")}<span className="font-semibold text-zinc-950">{jobStats.failed}</span>
          </div>
        </div>

        <div className="grid gap-3 border-b border-zinc-200 px-5 py-4 sm:grid-cols-2 xl:grid-cols-5">
          {(["pending", "processing", "completed", "partial_failed", "failed"] as ImageJobStatus[]).map((status) => (
            <div key={status} className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <span
                className={[
                  "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                  statusStyles[status],
                ].join(" ")}
              >
                {t(statusLabels[status].zh, statusLabels[status].en)}
              </span>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {t(statusHints[status].zh, statusHints[status].en)}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 border-b border-zinc-200 px-5 py-4 md:grid-cols-[220px_220px_1fr]">
          <div>
            <label htmlFor="job-type-filter" className="block text-xs font-medium text-zinc-500">
              {t("任务类型", "Job Type")}
            </label>
            <select
              id="job-type-filter"
              value={jobTypeFilter}
              onChange={(event) => {
                setJobTypeFilter(event.target.value as "all" | ImageJob["job_type"]);
                setJobsPage(1);
              }}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {jobTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? t("全部类型", "All Types") : t(jobTypeLabels[type].zh, jobTypeLabels[type].en)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="job-status-filter" className="block text-xs font-medium text-zinc-500">
              {t("任务状态", "Job Status")}
            </label>
            <select
              id="job-status-filter"
              value={jobStatusFilter}
              onChange={(event) => {
                setJobStatusFilter(event.target.value as "all" | ImageJobStatus);
                setJobsPage(1);
              }}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {jobStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? t("全部状态", "All Statuses") : t(statusLabels[status].zh, statusLabels[status].en)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setJobTypeFilter("all");
                setJobStatusFilter("all");
                setJobsPage(1);
              }}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              {t("清空筛选", "Clear Filters")}
            </button>
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="m-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        {jobs.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">{t("暂无图片处理任务。", "No image processing jobs yet.")}</div>
        ) : visibleJobs.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">{t("没有匹配当前筛选的图片任务。", "No image jobs match the current filters.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">{t("任务", "Job")}</th>
                  <th className="px-5 py-3">{t("类型", "Type")}</th>
                  <th className="px-5 py-3">{t("状态", "Status")}</th>
                  <th className="px-5 py-3">{t("图片数", "Images")}</th>
                  <th className="px-5 py-3">{t("进度", "Progress")}</th>
                  <th className="px-5 py-3">{t("失败", "Failed")}</th>
                  <th className="px-5 py-3">{t("创建时间", "Created")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {pagedJobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => {
                        setItemsPage(1);
                        void loadJobDetail(job.id);
                      }}
                      className={[
                        "cursor-pointer transition hover:bg-zinc-50",
                        isSelected ? "bg-emerald-50/60" : "",
                      ].join(" ")}
                    >
                      <td className="px-5 py-4 font-mono text-xs text-zinc-800" title={job.id}>
                        {shortId(job.id)}
                      </td>
                      <td className="px-5 py-4 text-zinc-700">{t(jobTypeLabels[job.job_type].zh, jobTypeLabels[job.job_type].en)}</td>
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                            statusStyles[job.status],
                          ].join(" ")}
                        >
                          {t(statusLabels[job.status].zh, statusLabels[job.status].en)}
                        </span>
                        <p className="mt-1 max-w-[220px] text-xs leading-5 text-zinc-500">
                          {t(statusHints[job.status].zh, statusHints[job.status].en)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-zinc-700">{job.total_count}</td>
                      <td className="px-5 py-4 text-zinc-700">
                        <div className="min-w-[120px]">
                          <div className="flex items-center justify-between gap-3">
                            <span>{doneCount(job)} / {job.total_count}</span>
                            <span className="text-xs text-zinc-400">{progressPercent(job)}%</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className="h-full rounded-full bg-emerald-600"
                              style={{ width: `${progressPercent(job)}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
                            <span>{t("成功", "OK")} {job.success_count}</span>
                            <span>{t("失败", "Fail")} {job.failed_count}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-zinc-700">{job.failed_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{formatDate(job.created_at, language === "zh" ? "zh-CN" : "en-US")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {visibleJobs.length > 0 ? (
          <div className="px-5 pb-5">
            <Pagination
              page={currentJobsPage}
              totalPages={jobsTotalPages}
              total={visibleJobs.length}
              unitZh="个任务"
              unitEn="jobs"
              onChange={setJobsPage}
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("任务详情", "Job Detail")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedJob ? t(`任务 ${shortId(selectedJob.id)} 的每张图片结果`, `Image results for job ${shortId(selectedJob.id)}`) : t("点击上方任务，查看每张图片的输入、结果和失败原因。", "Click a job above to view each image, result, and error reason.")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={failedOnly}
                onChange={(event) => {
                  setFailedOnly(event.target.checked);
                  setItemsPage(1);
                }}
                disabled={!selectedJob}
                className="h-4 w-4 rounded border-zinc-300"
              />
              {t("只看失败图片", "Failed Images Only")}
            </label>
            <button
              type="button"
              onClick={() => selectedJob && void loadJobDetail(selectedJob.id)}
              disabled={!selectedJob || isDetailLoading || isRetrying}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isDetailLoading ? t("刷新中...", "Refreshing...") : t("刷新详情", "Refresh Detail")}
            </button>
            <button
              type="button"
              onClick={() => void retryFailedItems()}
              disabled={!selectedJob || failedItems.length === 0 || isRetrying || isDetailLoading}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isRetrying ? t("重试中...", "Retrying...") : t("重试失败图片", "Retry Failed Images")}
            </button>
          </div>
        </div>

        {detailError ? (
          <div className="m-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {detailError}
          </div>
        ) : null}

        {selectedJob ? (
          <div className="m-5 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("处理进度", "Live Progress")}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {t(
                    `已处理 ${doneCount(selectedJob)} / ${selectedJob.total_count}，排队 ${selectedJobItemStats.pending}，处理中 ${selectedJobItemStats.processing}`,
                    `${doneCount(selectedJob)} / ${selectedJob.total_count} processed, ${selectedJobItemStats.pending} queued, ${selectedJobItemStats.processing} processing`,
                  )}
                </p>
              </div>
              <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                {progressPercent(selectedJob)}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-emerald-700 transition-all"
                style={{ width: `${progressPercent(selectedJob)}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-4">
              <span>{t("排队", "Queued")} {selectedJobItemStats.pending}</span>
              <span>{t("处理中", "Processing")} {selectedJobItemStats.processing}</span>
              <span>{t("成功", "Done")} {selectedJobItemStats.completed}</span>
              <span>{t("失败", "Failed")} {selectedJobItemStats.failed}</span>
            </div>
            {currentProcessingItems.length > 0 ? (
              <p className="mt-3 text-xs text-sky-700">
                {t("当前处理中：", "Currently processing: ")}
                {currentProcessingItems.slice(0, 3).map((item) => shortId(item.id)).join(", ")}
                {currentProcessingItems.length > 3 ? ` +${currentProcessingItems.length - 3}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}

        {retryProgress ? (
          <div className="m-5 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-emerald-800">
              <span>{t("重新执行进度", "Retry Progress")}</span>
              <span>
                {retryProgress.doneCount} / {retryProgress.totalCount}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-700 transition-all"
                style={{ width: `${retryProgress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        {!selectedJob ? (
          <div className="p-8 text-sm text-zinc-500">{t("请选择一个图片任务。", "Please select an image job.")}</div>
        ) : null}

        {selectedJob && visibleItems.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">
            {failedOnly ? t("当前任务没有失败图片。", "This job has no failed images.") : t("当前任务还没有图片明细。", "This job has no image details yet.")}
          </div>
        ) : null}

        {selectedJob && visibleItems.length > 0 ? (
          <div className="divide-y divide-zinc-200">
            {pagedItems.map((item) => (
              <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[160px_160px_1fr]">
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">{t("原图", "Input")}</p>
                  <a
                    href={item.input_url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
                    aria-label={t("查看原图", "View input image")}
                  >
                    <Image src={getDisplayImageSrc(item.input_url)} alt={t("原图", "Input")} fill sizes="160px" className="object-cover" />
                  </a>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">{t("结果图", "Output")}</p>
                  {item.output_url ? (
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block aspect-square overflow-hidden rounded-md border border-zinc-200 bg-zinc-100"
                      aria-label={t("查看结果图", "View output image")}
                    >
                      <Image src={getDisplayImageSrc(item.output_url)} alt={t("结果图", "Output")} fill sizes="160px" className="object-cover" />
                    </a>
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      {t("还没有结果", "No result yet")}
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={[
                        "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                        statusStyles[item.status],
                      ].join(" ")}
                    >
                      {t(itemStatusLabels[item.status].zh, itemStatusLabels[item.status].en)}
                    </span>
                    <span className="font-mono text-xs text-zinc-500" title={item.id}>
                      {shortId(item.id)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {t(itemStatusHints[item.status].zh, itemStatusHints[item.status].en)}
                    </span>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-zinc-500">{t("素材ID", "Asset ID")}</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-zinc-800">
                        {item.asset_id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("加入时间", "Created At")}</dt>
                      <dd className="mt-1 text-zinc-800">{formatDate(item.created_at, language === "zh" ? "zh-CN" : "en-US")}</dd>
                    </div>
                  </dl>
                  {item.error_message ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <p className="mb-1 text-xs font-semibold text-red-800">{t("失败原因", "Failure Reason")}</p>
                      {item.error_message}
                    </div>
                  ) : null}
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => void retryFailedItems([item.id])}
                      disabled={isRetrying || isDetailLoading}
                      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {t("重试这张", "Retry This Image")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {selectedJob && visibleItems.length > 0 ? (
          <div className="px-5 pb-5">
            <Pagination
              page={currentItemsPage}
              totalPages={itemsTotalPages}
              total={visibleItems.length}
              unitZh="项"
              unitEn="items"
              onChange={setItemsPage}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
