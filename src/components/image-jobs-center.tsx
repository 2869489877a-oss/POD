"use client";

import { useMemo, useState } from "react";

import { fetchImageJobs, fetchImageJobDetail, retryImageJob } from "@/lib/actions/image-jobs";
import { useSettings } from "@/lib/settings/context";

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
  job_type: "resize" | "cutout" | "print_extraction" | "enhance" | "mockup";
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

type JobsResponse = {
  error?: string;
  jobs?: ImageJob[];
};

type JobDetailResponse = {
  error?: string;
  job?: ImageJobDetail;
};

type RetryJobResponse = {
  error?: string;
  job?: {
    failed_count: number;
    id: string;
    retried_count: number;
    status: ImageJobStatus;
    success_count: number;
    total_count: number;
  };
  message?: string;
};

type ImageJobsCenterProps = {
  initialError?: string | null;
  initialJobs: ImageJob[];
};

const jobTypeLabels: Record<ImageJob["job_type"], { zh: string; en: string }> = {
  cutout: { zh: "抠图", en: "Cutout" },
  enhance: { zh: "清晰化", en: "Enhance" },
  mockup: { zh: "套图", en: "Mockup" },
  print_extraction: { zh: "印花提取", en: "Print Extract" },
  resize: { zh: "改尺寸", en: "Resize" },
};

const statusLabels: Record<ImageJobStatus, { zh: string; en: string }> = {
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  partial_failed: { zh: "部分失败", en: "Partial Failed" },
  pending: { zh: "等待处理", en: "Pending" },
  processing: { zh: "处理中", en: "Processing" },
};

const itemStatusLabels: Record<ImageJobItem["status"], { zh: string; en: string }> = {
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  pending: { zh: "等待处理", en: "Pending" },
  processing: { zh: "处理中", en: "Processing" },
};

const statusStyles: Record<ImageJobStatus | ImageJobItem["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  partial_failed: "bg-amber-50 text-amber-700",
  pending: "bg-zinc-100 text-zinc-700",
  processing: "bg-sky-50 text-sky-700",
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(id: string) {
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
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
  const [message, setMessage] = useState<string | null>(null);
  const [retryTargetIds, setRetryTargetIds] = useState<string[]>([]);

  const visibleItems = useMemo(() => {
    if (!selectedJob) {
      return [];
    }

    return failedOnly
      ? selectedJob.items.filter((item) => item.status === "failed")
      : selectedJob.items;
  }, [failedOnly, selectedJob]);
  const failedItems = selectedJob?.items.filter((item) => item.status === "failed") ?? [];
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

  async function refreshJobs() {
    setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchImageJobs();
      if (data.error) throw new Error(data.error);
      setJobs(data.jobs as ImageJob[]);

      if (selectedJob) {
        await loadJobDetail(selectedJob.id, false, false);
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
      void loadJobDetail(selectedJob.id, false, false).catch(() => undefined);
    }, 1000);

    try {
      const data = await retryImageJob(selectedJob.id);
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

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("图片任务列表", "Image Job List")}</h3>
            <p className="mt-1 text-sm text-zinc-500">{t(`共 ${jobs.length} 个任务`, `${jobs.length} jobs`)}</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshJobs()}
            disabled={isRefreshing}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isRefreshing ? t("刷新中...", "Refreshing...") : t("刷新任务状态", "Refresh Job Status")}
          </button>
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
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">{t("任务ID", "Job ID")}</th>
                  <th className="px-5 py-3">{t("任务类型", "Job Type")}</th>
                  <th className="px-5 py-3">{t("状态", "Status")}</th>
                  <th className="px-5 py-3">{t("总数", "Total")}</th>
                  <th className="px-5 py-3">{t("成功数", "Success")}</th>
                  <th className="px-5 py-3">{t("失败数", "Failed")}</th>
                  <th className="px-5 py-3">{t("创建时间", "Created At")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {jobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => void loadJobDetail(job.id)}
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
                      </td>
                      <td className="px-5 py-4 text-zinc-700">{job.total_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{job.success_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{job.failed_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{formatDate(job.created_at, language === "zh" ? "zh-CN" : "en-US")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("任务明细", "Job Detail")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedJob ? t(`任务 ${shortId(selectedJob.id)}`, `Job ${shortId(selectedJob.id)}`) : t("点击上方任务查看子任务", "Click a job above to view its items")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={failedOnly}
                onChange={(event) => setFailedOnly(event.target.checked)}
                disabled={!selectedJob}
                className="h-4 w-4 rounded border-zinc-300"
              />
              {t("只查看失败项", "Failed Only")}
            </label>
            <button
              type="button"
              onClick={() => selectedJob && void loadJobDetail(selectedJob.id)}
              disabled={!selectedJob || isDetailLoading || isRetrying}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isDetailLoading ? t("刷新中...", "Refreshing...") : t("刷新明细", "Refresh Detail")}
            </button>
            <button
              type="button"
              onClick={() => void retryFailedItems()}
              disabled={!selectedJob || failedItems.length === 0 || isRetrying || isDetailLoading}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isRetrying ? t("重试中...", "Retrying...") : t("批量重新执行失败项", "Retry Failed Items")}
            </button>
          </div>
        </div>

        {detailError ? (
          <div className="m-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {detailError}
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
          <div className="p-8 text-sm text-zinc-500">{t("请选择一个图片处理任务。", "Please select an image processing job.")}</div>
        ) : null}

        {selectedJob && visibleItems.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">
            {failedOnly ? t("当前任务没有失败项。", "This job has no failed items.") : t("当前任务没有子任务。", "This job has no items.")}
          </div>
        ) : null}

        {selectedJob && visibleItems.length > 0 ? (
          <div className="divide-y divide-zinc-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[160px_160px_1fr]">
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">{t("原图", "Input")}</p>
                  <a
                    href={item.input_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-cover bg-center"
                    style={{ backgroundImage: `url("${item.input_url}")` }}
                    aria-label={t("查看原图", "View input image")}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">{t("处理结果图", "Output")}</p>
                  {item.output_url ? (
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-cover bg-center"
                      style={{ backgroundImage: `url("${item.output_url}")` }}
                      aria-label={t("查看处理结果图", "View output image")}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      {t("暂无结果", "No result")}
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
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-zinc-500">{t("素材ID", "Asset ID")}</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-zinc-800">
                        {item.asset_id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">{t("创建时间", "Created At")}</dt>
                      <dd className="mt-1 text-zinc-800">{formatDate(item.created_at, language === "zh" ? "zh-CN" : "en-US")}</dd>
                    </div>
                  </dl>
                  {item.error_message ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {item.error_message}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">{t("无失败原因。", "No failure reason.")}</p>
                  )}
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => void retryFailedItems([item.id])}
                      disabled={isRetrying || isDetailLoading}
                      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      {t("重新执行", "Retry")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
