"use client";

import { useMemo, useState } from "react";

import { fetchImageJobs, fetchImageJobDetail, retryImageJob } from "@/lib/actions/image-jobs";

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
  job_type: "resize" | "cutout" | "enhance" | "mockup";
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

const jobTypeLabels: Record<ImageJob["job_type"], string> = {
  cutout: "抠图",
  enhance: "清晰化",
  mockup: "套图",
  resize: "改尺寸",
};

const statusLabels: Record<ImageJobStatus, string> = {
  completed: "已完成",
  failed: "失败",
  partial_failed: "部分失败",
  pending: "等待处理",
  processing: "处理中",
};

const itemStatusLabels: Record<ImageJobItem["status"], string> = {
  completed: "已完成",
  failed: "失败",
  pending: "等待处理",
  processing: "处理中",
};

const statusStyles: Record<ImageJobStatus | ImageJobItem["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  partial_failed: "bg-amber-50 text-amber-700",
  pending: "bg-zinc-100 text-zinc-700",
  processing: "bg-sky-50 text-sky-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(id: string) {
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function ImageJobsCenter({ initialError = null, initialJobs }: ImageJobsCenterProps) {
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
      setError(requestError instanceof Error ? requestError.message : "读取任务列表失败");
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
      if (data.error || !data.job) throw new Error(data.error ?? "读取任务明细失败");

      setSelectedJob(data.job as ImageJobDetail);
      if (resetFilter) {
        setFailedOnly(false);
      }
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "读取任务明细失败");
    } finally {
      if (showLoading) {
        setIsDetailLoading(false);
      }
    }
  }

  async function retryFailedItems(itemIds?: string[]) {
    if (!selectedJob) {
      setDetailError("请选择一个图片处理任务");
      return;
    }

    const targetIds = itemIds && itemIds.length > 0 ? itemIds : failedItems.map((item) => item.id);

    if (targetIds.length === 0) {
      setDetailError("当前任务没有失败项可重新执行");
      return;
    }

    setIsRetrying(true);
    setRetryTargetIds(targetIds);
    setDetailError(null);
    setMessage(`正在重新执行 ${targetIds.length} 个失败项...`);
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

      setMessage("重新执行任务已提交");
      await refreshJobs();
      await loadJobDetail(selectedJob.id, false, false);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "重新执行失败任务失败");
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
            <h3 className="text-base font-semibold text-zinc-950">图片任务列表</h3>
            <p className="mt-1 text-sm text-zinc-500">共 {jobs.length} 个任务</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshJobs()}
            disabled={isRefreshing}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isRefreshing ? "刷新中..." : "刷新任务状态"}
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
          <div className="p-8 text-sm text-zinc-500">暂无图片处理任务。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">任务ID</th>
                  <th className="px-5 py-3">任务类型</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">总数</th>
                  <th className="px-5 py-3">成功数</th>
                  <th className="px-5 py-3">失败数</th>
                  <th className="px-5 py-3">创建时间</th>
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
                      <td className="px-5 py-4 text-zinc-700">{jobTypeLabels[job.job_type]}</td>
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                            statusStyles[job.status],
                          ].join(" ")}
                        >
                          {statusLabels[job.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-zinc-700">{job.total_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{job.success_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{job.failed_count}</td>
                      <td className="px-5 py-4 text-zinc-700">{formatDate(job.created_at)}</td>
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
            <h3 className="text-base font-semibold text-zinc-950">任务明细</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedJob ? `任务 ${shortId(selectedJob.id)}` : "点击上方任务查看子任务"}
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
              只查看失败项
            </label>
            <button
              type="button"
              onClick={() => selectedJob && void loadJobDetail(selectedJob.id)}
              disabled={!selectedJob || isDetailLoading || isRetrying}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isDetailLoading ? "刷新中..." : "刷新明细"}
            </button>
            <button
              type="button"
              onClick={() => void retryFailedItems()}
              disabled={!selectedJob || failedItems.length === 0 || isRetrying || isDetailLoading}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isRetrying ? "重试中..." : "批量重新执行失败项"}
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
              <span>重新执行进度</span>
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
          <div className="p-8 text-sm text-zinc-500">请选择一个图片处理任务。</div>
        ) : null}

        {selectedJob && visibleItems.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">
            {failedOnly ? "当前任务没有失败项。" : "当前任务没有子任务。"}
          </div>
        ) : null}

        {selectedJob && visibleItems.length > 0 ? (
          <div className="divide-y divide-zinc-200">
            {visibleItems.map((item) => (
              <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[160px_160px_1fr]">
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">原图</p>
                  <a
                    href={item.input_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-cover bg-center"
                    style={{ backgroundImage: `url("${item.input_url}")` }}
                    aria-label="查看原图"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500">处理结果图</p>
                  {item.output_url ? (
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-cover bg-center"
                      style={{ backgroundImage: `url("${item.output_url}")` }}
                      aria-label="查看处理结果图"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      暂无结果
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
                      {itemStatusLabels[item.status]}
                    </span>
                    <span className="font-mono text-xs text-zinc-500" title={item.id}>
                      {shortId(item.id)}
                    </span>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-zinc-500">素材ID</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-zinc-800">
                        {item.asset_id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">创建时间</dt>
                      <dd className="mt-1 text-zinc-800">{formatDate(item.created_at)}</dd>
                    </div>
                  </dl>
                  {item.error_message ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {item.error_message}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">无失败原因。</p>
                  )}
                  {item.status === "failed" ? (
                    <button
                      type="button"
                      onClick={() => void retryFailedItems([item.id])}
                      disabled={isRetrying || isDetailLoading}
                      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                      重新执行
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
