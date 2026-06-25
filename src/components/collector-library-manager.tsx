"use client";

/* eslint-disable @next/next/no-img-element -- Collector images are local/proxied user files and are intentionally rendered as lazy previews. */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Pagination } from "@/components/pagination";
import { getDisplayImageSrc } from "@/lib/local-asset-url";
import { useSettings } from "@/lib/settings/context";

type CollectorLibraryItem = {
  createdAt: string;
  date: string;
  employeeName: string;
  fileSize: number;
  filename: string;
  format: string | null;
  height: number | null;
  pageUrl: string | null;
  publicUrl: string;
  relativePath: string;
  siteType: string;
  sourceUrl: string | null;
  updatedAt: string;
  uploadDate?: string;
  width: number | null;
};

type CollectorMutationResult = {
  error?: string;
  relative_path?: string;
  success: boolean;
};

type CollectorResponse = {
  dateBuckets?: Array<{ count: number; date: string }>;
  error?: string;
  failed_count?: number;
  items?: CollectorLibraryItem[];
  job?: CollectorOperationJob;
  job_id?: string;
  limit?: number;
  offset?: number;
  queued?: boolean;
  relative_paths?: string[];
  results?: CollectorMutationResult[];
  success_count?: number;
  total?: number;
};

type CollectorMutationMode = "delete" | "promote" | "risk-library";

type CollectorOperationJob = {
  failed_count: number;
  id: string;
  operation: "promote" | "add_to_risk_library" | "delete";
  status: "pending" | "processing" | "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
};

type CollectorJobResponse = {
  error?: string;
  job?: CollectorOperationJob;
};

const COLLECTOR_PAGE_SIZE = 120;
const COLLECTOR_SELECT_ALL_LIMIT = 20000;

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatFileSize(size: number) {
  if (size < 1024) return size + " B";
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatUploadDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return year + "-" + month + "-" + day;
}

function getUploadDate(item: CollectorLibraryItem) {
  return item.uploadDate || item.date || formatUploadDateKey(item.createdAt);
}

function dateKeyToDate(dateKey: string) {
  return new Date(dateKey + "T00:00:00+08:00");
}

function addDays(dateKey: string, days: number) {
  const date = dateKeyToDate(dateKey);
  date.setDate(date.getDate() + days);
  return formatUploadDateKey(date.toISOString());
}

function shiftMonth(monthKey: string, offset: number) {
  const date = dateKeyToDate(monthKey + "-01");
  date.setMonth(date.getMonth() + offset);
  return formatUploadDateKey(date.toISOString()).slice(0, 7);
}

function buildCalendarDays(monthKey: string) {
  const firstDay = dateKeyToDate(monthKey + "-01");
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = formatUploadDateKey(date.toISOString());
    return {
      dateKey,
      day: Number(dateKey.slice(8, 10)),
      inMonth: dateKey.startsWith(monthKey),
    };
  });
}

function calendarMonthTitle(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}年 ${Number(month)}月`;
}

export function CollectorLibraryManager() {
  const { isDark, t } = useSettings();
  const [items, setItems] = useState<CollectorLibraryItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => formatUploadDateKey(new Date().toISOString()).slice(0, 7));
  const [page, setPage] = useState(1);
  const [siteFilter, setSiteFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverDateBuckets, setServerDateBuckets] = useState<Array<{ count: number; date: string }>>([]);
  const [total, setTotal] = useState(0);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [pendingMutationPaths, setPendingMutationPaths] = useState<Set<string>>(new Set());
  const [pendingMutationMode, setPendingMutationMode] = useState<CollectorMutationMode | null>(null);

  const employees = useMemo(() => uniqueSorted(items.map((item) => item.employeeName)), [items]);
  const sites = useMemo(() => uniqueSorted(items.map((item) => item.siteType)), [items]);
  const loadedDateBuckets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const uploadDate = getUploadDate(item);
      counts.set(uploadDate, (counts.get(uploadDate) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([date, count]) => ({ count, date }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [items]);
  const dateBuckets = serverDateBuckets.length > 0 ? serverDateBuckets : loadedDateBuckets;
  const maxDateCount = Math.max(1, ...dateBuckets.map((bucket) => bucket.count));
  const latestUploadDate = dateBuckets[0]?.date || formatUploadDateKey(new Date().toISOString());
  const activeStartDate = startDate && endDate && startDate > endDate ? endDate : startDate;
  const activeEndDate = startDate && endDate && startDate > endDate ? startDate : endDate;
  const dateCountMap = useMemo(() => new Map(dateBuckets.map((bucket) => [bucket.date, bucket.count])), [dateBuckets]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const calendarYears = useMemo(() => {
    const years = new Set(dateBuckets.map((bucket) => bucket.date.slice(0, 4)));
    years.add(calendarMonth.slice(0, 4));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [calendarMonth, dateBuckets]);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")), []);
  const previewItem = useMemo(
    () => items.find((item) => item.relativePath === previewPath) || null,
    [items, previewPath],
  );

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return items.filter((item) => {
      const uploadDate = getUploadDate(item);
      if (employeeFilter !== "all" && item.employeeName !== employeeFilter) return false;
      if (activeStartDate && uploadDate < activeStartDate) return false;
      if (activeEndDate && uploadDate > activeEndDate) return false;
      if (siteFilter !== "all" && item.siteType !== siteFilter) return false;
      if (!keyword) return true;

      return [item.filename, item.relativePath, item.sourceUrl || "", item.pageUrl || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [activeEndDate, activeStartDate, employeeFilter, items, query, siteFilter]);

  const selectedCount = selected.size;
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selected.has(item.relativePath));
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 0) / COLLECTOR_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const previewPendingMode = previewItem && pendingMutationPaths.has(previewItem.relativePath) ? pendingMutationMode : null;
  const panelClass = isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-white";
  const mutedClass = isDark ? "text-zinc-400" : "text-zinc-500";
  const textClass = isDark ? "text-white" : "text-zinc-950";
  const inputClass = isDark
    ? "border-white/[0.10] bg-zinc-950/70 text-white"
    : "border-zinc-300 bg-white text-zinc-900";
  const buttonClass =
    "ui-press rounded-md border px-3 py-2 text-sm font-medium transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
  const neutralButtonClass = isDark
    ? buttonClass + " border-white/[0.10] text-zinc-200 hover:bg-white/[0.06]"
    : buttonClass + " border-zinc-300 text-zinc-800 hover:bg-zinc-100";
  const riskButtonClass = isDark
    ? "rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200 transition hover:-translate-y-0.5 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:-translate-y-0.5 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50";

  function mutationLabel(mode: CollectorMutationMode | null) {
    if (mode === "promote") return t("正在入素材库", "Importing to assets");
    if (mode === "risk-library") return t("正在入风险库", "Adding to risk library");
    return t("正在删除", "Deleting");
  }

  async function loadItems(targetPage = page, forceRebuildIndex = false) {
    const normalizedPage = Math.max(1, targetPage);
    const offset = (normalizedPage - 1) * COLLECTOR_PAGE_SIZE;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: String(COLLECTOR_PAGE_SIZE),
        offset: String(offset),
      });
      if (activeStartDate) params.set("start_date", activeStartDate);
      if (activeEndDate) params.set("end_date", activeEndDate);
      if (forceRebuildIndex) params.set("rebuild_index", "1");

      const response = await fetch(`/api/collector-library?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as CollectorResponse;

      if (!response.ok) {
        throw new Error(data.error || t("读取采集库失败", "Failed to load collector library"));
      }

      const nextItems = data.items || [];
      setServerDateBuckets(data.dateBuckets || []);
      setTotal(data.total ?? nextItems.length);
      setItems(nextItems);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取采集库失败", "Failed to load collector library"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItems(safePage);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEndDate, activeStartDate, safePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (dateBuckets.length > 0 && !startDate && !endDate) {
      const timer = window.setTimeout(() => setCalendarMonth(dateBuckets[0].date.slice(0, 7)), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [dateBuckets, endDate, startDate]);

  useEffect(() => {
    if (previewPath && !previewItem) {
      const timer = window.setTimeout(() => setPreviewPath(null), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [previewItem, previewPath]);

  function applyRecentDays(days: number) {
    setPage(1);
    setSelected(new Set());
    setEndDate(latestUploadDate);
    setStartDate(addDays(latestUploadDate, -(days - 1)));
    setCalendarMonth(latestUploadDate.slice(0, 7));
  }

  function applyThisMonth() {
    setPage(1);
    setSelected(new Set());
    setStartDate(latestUploadDate.slice(0, 8) + "01");
    setEndDate(latestUploadDate);
    setCalendarMonth(latestUploadDate.slice(0, 7));
  }

  function applySingleUploadDate(uploadDate: string) {
    setPage(1);
    setSelected(new Set());
    setStartDate(uploadDate);
    setEndDate(uploadDate);
    setCalendarMonth(uploadDate.slice(0, 7));
  }

  function clearDateRange() {
    setPage(1);
    setSelected(new Set());
    setStartDate("");
    setEndDate("");
  }

  function selectCalendarDate(dateKey: string) {
    setPage(1);
    setSelected(new Set());
    setCalendarMonth(dateKey.slice(0, 7));

    if (!startDate || endDate) {
      setStartDate(dateKey);
      setEndDate("");
      return;
    }

    if (dateKey < startDate) {
      setStartDate(dateKey);
      setEndDate(startDate);
      return;
    }

    setEndDate(dateKey);
  }

  function setCalendarYear(year: string) {
    setCalendarMonth(year + "-" + calendarMonth.slice(5, 7));
  }

  function setCalendarMonthNumber(month: string) {
    setCalendarMonth(calendarMonth.slice(0, 4) + "-" + month);
  }

  function toggleItem(relativePath: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  }

  function toggleFiltered() {
    setSelected((current) => {
      if (allFilteredSelected) {
        const next = new Set(current);
        for (const item of filteredItems) next.delete(item.relativePath);
        return next;
      }

      const next = new Set(current);
      for (const item of filteredItems) next.add(item.relativePath);
      return next;
    });
  }

  async function selectAllResults() {
    if (total === 0 || isSelectingAll || isMutating) return;

    setIsSelectingAll(true);
    setError(null);
    setMessage(null);

    try {
      const params = new URLSearchParams({
        limit: String(COLLECTOR_SELECT_ALL_LIMIT),
        offset: "0",
        paths_only: "1",
      });
      if (activeStartDate) params.set("start_date", activeStartDate);
      if (activeEndDate) params.set("end_date", activeEndDate);

      const response = await fetch(`/api/collector-library?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as CollectorResponse;

      if (!response.ok) {
        throw new Error(data.error || t("全选采集库失败", "Failed to select collector images"));
      }

      const paths = data.relative_paths || [];
      setSelected(new Set(paths));
      setMessage(
        paths.length >= COLLECTOR_SELECT_ALL_LIMIT && (data.total || 0) > paths.length
          ? t(
              `已选择前 ${paths.length} 张，采集库数量较大，请分日期批量处理`,
              `Selected first ${paths.length}; use date ranges for larger batches`,
            )
          : t(`已全选 ${paths.length} 张采集图片`, `${paths.length} collector images selected`),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("全选采集库失败", "Failed to select collector images"));
    } finally {
      setIsSelectingAll(false);
    }
  }

  async function downloadCollectorItem(item: CollectorLibraryItem) {
    setError(null);

    try {
      const response = await fetch(item.publicUrl);
      if (!response.ok) {
        throw new Error(response.statusText || "HTTP " + response.status);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? t("下载失败: " + downloadError.message, "Download failed: " + downloadError.message)
          : t("下载失败", "Download failed"),
      );
    }
  }

  async function pollCollectorOperationJob(jobId: string, mode: CollectorMutationMode) {
    const deadline = Date.now() + 30 * 60_000;
    let consecutiveFailures = 0;

    for (;;) {
      await sleep(1500);

      let data: CollectorJobResponse;
      try {
        const response = await fetch(`/api/collector-library/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        data = (await response.json()) as CollectorJobResponse;

        if (!response.ok || data.error || !data.job) {
          throw new Error(data.error || t("读取后台任务失败", "Failed to read background job"));
        }
        consecutiveFailures = 0;
      } catch (pollError) {
        consecutiveFailures += 1;
        if (consecutiveFailures < 3) {
          setMessage(t(
            `后台任务进度读取失败，正在重试 ${consecutiveFailures}/3...`,
            `Failed to read background progress, retrying ${consecutiveFailures}/3...`,
          ));
          continue;
        }

        throw pollError;
      }

      const done = data.job.success_count + data.job.failed_count;
      setMessage(
        mode === "promote"
          ? t(`入素材库处理中：${done}/${data.job.total_count}，成功 ${data.job.success_count}，失败 ${data.job.failed_count}`, `Importing to assets: ${done}/${data.job.total_count}, ${data.job.success_count} succeeded, ${data.job.failed_count} failed`)
          : mode === "risk-library"
            ? t(`入风险库处理中：${done}/${data.job.total_count}，成功 ${data.job.success_count}，失败 ${data.job.failed_count}`, `Adding to risk library: ${done}/${data.job.total_count}, ${data.job.success_count} succeeded, ${data.job.failed_count} failed`)
            : t(`删除处理中：${done}/${data.job.total_count}，成功 ${data.job.success_count}，失败 ${data.job.failed_count}`, `Deleting: ${done}/${data.job.total_count}, ${data.job.success_count} succeeded, ${data.job.failed_count} failed`),
      );

      if (data.job.status === "completed" || data.job.status === "failed" || data.job.status === "partial_failed") {
        return data.job;
      }

      if (Date.now() > deadline) {
        throw new Error(t("后台任务仍在运行，请稍后刷新页面查看结果", "Background job is still running. Refresh later to see results."));
      }
    }
  }

  async function mutateSelected(paths: string[], mode: CollectorMutationMode) {
    if (paths.length === 0) {
      setError(t("请先选择图片", "Please select images first"));
      return;
    }

    if (mode === "delete" && !window.confirm(t("确认删除选中的采集图片？", "Delete selected collector images?"))) {
      return;
    }

    setIsMutating(true);
    setPendingMutationPaths(new Set(paths));
    setPendingMutationMode(mode);
    setError(null);
    setMessage(null);

    try {
      const body =
        mode === "delete"
          ? { relative_paths: paths }
          : { action: mode === "risk-library" ? "add_to_risk_library" : "promote", relative_paths: paths };
      const response = await fetch("/api/collector-library", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: mode === "delete" ? "DELETE" : "POST",
      });
      const data = (await response.json()) as CollectorResponse;

      if (data.queued && data.job_id) {
        setMessage(t(`已提交后台任务 ${data.job_id.slice(0, 8)}，worker 正在处理...`, `Queued background job ${data.job_id.slice(0, 8)}; worker is processing...`));
        const job = await pollCollectorOperationJob(data.job_id, mode);
        if (mode !== "risk-library") {
          setSelected((current) => new Set(Array.from(current).filter((path) => !paths.includes(path))));
          await loadItems(safePage);
        }
        setMessage(
          mode === "promote"
            ? t(`入素材库完成 ${job.success_count} 张，失败 ${job.failed_count} 张`, `${job.success_count} imported to assets, ${job.failed_count} failed`)
            : mode === "risk-library"
              ? t(`入风险库完成 ${job.success_count} 张，失败 ${job.failed_count} 张`, `${job.success_count} added to risk library, ${job.failed_count} failed`)
              : t(`删除完成 ${job.success_count} 张，失败 ${job.failed_count} 张`, `${job.success_count} deleted, ${job.failed_count} failed`),
        );
        if (job.failed_count > 0) {
          setError(t("部分采集库后台任务失败，请查看服务器 worker 日志", "Some background collector tasks failed. Check worker logs."));
        }
        return;
      }

      const results = data.results || [];
      const successPaths = new Set(
        results.filter((result) => result.success && result.relative_path).map((result) => result.relative_path as string),
      );

      if (!response.ok && successPaths.size === 0) {
        throw new Error(data.error || t("操作失败", "Operation failed"));
      }

      if (mode !== "risk-library") {
        setItems((current) => current.filter((item) => !successPaths.has(item.relativePath)));
        setTotal((current) => Math.max(0, current - successPaths.size));
      }
      setSelected((current) => new Set(Array.from(current).filter((path) => !successPaths.has(path))));
      setMessage(
        mode === "promote"
          ? t("入素材库成功 " + (data.success_count || 0) + " 张，失败 " + (data.failed_count || 0) + " 张", (data.success_count || 0) + " imported to assets, " + (data.failed_count || 0) + " failed")
          : mode === "risk-library"
            ? t("入风险库完成 " + (data.success_count || 0) + " 张，失败 " + (data.failed_count || 0) + " 张", (data.success_count || 0) + " added to risk library, " + (data.failed_count || 0) + " failed")
            : t("删除成功 " + (data.success_count || 0) + " 张，失败 " + (data.failed_count || 0) + " 张", (data.success_count || 0) + " deleted, " + (data.failed_count || 0) + " failed"),
      );

      const failed = results.filter((result) => !result.success);
      if (failed.length > 0) {
        setError(failed.map((result) => result.error || t("单张处理失败", "Single item failed")).join("\n"));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("操作失败", "Operation failed"));
    } finally {
      setIsMutating(false);
      setPendingMutationPaths(new Set());
      setPendingMutationMode(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className={"rounded-md border p-4 " + panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
          <label className="block text-sm font-medium">
            <span className={textClass}>{t("搜索", "Search")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("文件名 / 来源链接", "Filename / source URL")}
              className={"mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none " + inputClass}
            />
          </label>
          <label className="block text-sm font-medium">
            <span className={textClass}>{t("员工", "Employee")}</span>
            <select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              className={"mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none " + inputClass}
            >
              <option value="all">{t("全部", "All")}</option>
              {employees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            <span className={textClass}>{t("网站", "Site")}</span>
            <select
              value={siteFilter}
              onChange={(event) => setSiteFilter(event.target.value)}
              className={"mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none " + inputClass}
            >
              <option value="all">{t("全部", "All")}</option>
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void loadItems(page, true)} disabled={isLoading || isMutating} className={neutralButtonClass + " self-end"}>
            {isLoading ? t("刷新中", "Refreshing") : t("刷新", "Refresh")}
          </button>
        </div>

        <div className="mt-4 rounded-md border border-dashed border-cyan-500/25 p-3">
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <div className={isDark ? "rounded-md border border-white/[0.08] bg-zinc-950/40 p-3" : "rounded-md border border-zinc-200 bg-zinc-50 p-3"}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}
                  className={neutralButtonClass + " h-9 w-9 px-0"}
                  aria-label={t("上个月", "Previous month")}
                >
                  {"<"}
                </button>
                <div className="flex items-center gap-2">
                  <select
                    value={calendarMonth.slice(0, 4)}
                    onChange={(event) => setCalendarYear(event.target.value)}
                    className={"h-9 rounded-md border px-2 text-sm outline-none " + inputClass}
                    aria-label={t("年份", "Year")}
                  >
                    {calendarYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <select
                    value={calendarMonth.slice(5, 7)}
                    onChange={(event) => setCalendarMonthNumber(event.target.value)}
                    className={"h-9 rounded-md border px-2 text-sm outline-none " + inputClass}
                    aria-label={t("月份", "Month")}
                  >
                    {monthOptions.map((month) => (
                      <option key={month} value={month}>
                        {Number(month)}月
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}
                  className={neutralButtonClass + " h-9 w-9 px-0"}
                  aria-label={t("下个月", "Next month")}
                >
                  {">"}
                </button>
              </div>

              <div className={"mt-3 text-center text-sm font-semibold " + textClass}>{calendarMonthTitle(calendarMonth)}</div>
              <div className={"mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold " + mutedClass}>
                {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((day) => {
                  const count = dateCountMap.get(day.dateKey) || 0;
                  const isStart = day.dateKey === activeStartDate;
                  const isEnd = day.dateKey === activeEndDate;
                  const inRange =
                    activeStartDate && activeEndDate && day.dateKey >= activeStartDate && day.dateKey <= activeEndDate;
                  const isSelected = isStart || isEnd || Boolean(inRange);
                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      onClick={() => selectCalendarDate(day.dateKey)}
                      className={[
                        "relative h-12 rounded-md border text-xs font-semibold transition hover:-translate-y-0.5",
                        isSelected
                          ? isDark
                            ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                            : "border-cyan-500 bg-cyan-50 text-cyan-900 shadow-sm"
                          : day.inMonth
                            ? isDark
                              ? "border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:bg-white/[0.08]"
                              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100"
                            : isDark
                              ? "border-white/[0.04] bg-transparent text-zinc-600"
                              : "border-zinc-100 bg-transparent text-zinc-300",
                      ].join(" ")}
                    >
                      <span>{day.day}</span>
                      {count > 0 ? (
                        <span className="absolute bottom-1 left-1/2 min-w-5 -translate-x-1/2 rounded-full bg-emerald-500 px-1 text-[10px] leading-4 text-white">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3">
              <div>
                <p className={"text-sm font-semibold " + textClass}>{t("上传日期区间", "Upload Date Range")}</p>
                <p className={"mt-1 text-xs " + mutedClass}>
                  {activeStartDate || activeEndDate
                    ? (activeStartDate || activeEndDate) + (activeEndDate && activeEndDate !== activeStartDate ? " - " + activeEndDate : "")
                    : t("未限制日期", "No date limit")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyRecentDays(7)} className={neutralButtonClass}>
                  {t("最近 7 天", "Last 7 Days")}
                </button>
                <button type="button" onClick={() => applyRecentDays(30)} className={neutralButtonClass}>
                  {t("最近 30 天", "Last 30 Days")}
                </button>
                <button type="button" onClick={applyThisMonth} className={neutralButtonClass}>
                  {t("本月", "This Month")}
                </button>
                <button type="button" onClick={clearDateRange} className={neutralButtonClass}>
                  {t("清空日期", "Clear Dates")}
                </button>
              </div>
              <div className={isDark ? "rounded-md bg-white/[0.04] p-3" : "rounded-md bg-white p-3"}>
                <p className={"text-xs " + mutedClass}>
                  {t("日期格右下角数字表示当天上传数量。先点开始日期，再点结束日期，即可筛选区间。", "The number on each date is that day's upload count. Click a start date, then an end date to filter the range.")}
                </p>
              </div>
            </div>
          </div>

          <div className="hidden">
            <label className="block text-sm font-medium">
              <span className={textClass}>{t("上传日期起", "Upload Date From")}</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={"mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none " + inputClass}
              />
            </label>
            <label className="block text-sm font-medium">
              <span className={textClass}>{t("上传日期止", "Upload Date To")}</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className={"mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none " + inputClass}
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="button" onClick={() => applyRecentDays(7)} className={neutralButtonClass}>
                {t("最近 7 天", "Last 7 Days")}
              </button>
              <button type="button" onClick={() => applyRecentDays(30)} className={neutralButtonClass}>
                {t("最近 30 天", "Last 30 Days")}
              </button>
              <button type="button" onClick={applyThisMonth} className={neutralButtonClass}>
                {t("本月", "This Month")}
              </button>
              <button type="button" onClick={clearDateRange} className={neutralButtonClass}>
                {t("清空日期", "Clear Dates")}
              </button>
            </div>
          </div>

          {dateBuckets.length > 0 ? (
            <div className="hidden">
              {dateBuckets.slice(0, 18).map((bucket) => {
                const activeStartDate = startDate && endDate && startDate > endDate ? endDate : startDate;
                const activeEndDate = startDate && endDate && startDate > endDate ? startDate : endDate;
                const selectedDate =
                  activeStartDate && activeEndDate
                    ? bucket.date >= activeStartDate && bucket.date <= activeEndDate
                    : bucket.date === activeStartDate || bucket.date === activeEndDate;
                return (
                  <button
                    key={bucket.date}
                    type="button"
                    onClick={() => applySingleUploadDate(bucket.date)}
                    className={[
                      "rounded-md border p-2 text-left transition hover:-translate-y-0.5",
                      selectedDate
                        ? "border-cyan-400 bg-cyan-500/10"
                        : isDark
                          ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                          : "border-zinc-200 bg-white hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={"text-xs font-semibold " + textClass}>{bucket.date}</span>
                      <span className={"text-[11px] " + mutedClass}>{bucket.count}</span>
                    </div>
                    <div className={isDark ? "mt-2 h-1.5 rounded-full bg-white/[0.08]" : "mt-2 h-1.5 rounded-full bg-zinc-100"}>
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: Math.max(12, Math.round((bucket.count / maxDateCount) * 100)) + "%" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={"text-sm " + mutedClass}>
          {t(
            `第 ${safePage}/${totalPages} 页，当前页 ${filteredItems.length} 张，全部 ${total} 张，已选 ${selectedCount} 张`,
            `Page ${safePage}/${totalPages}, ${filteredItems.length} on this page, ${total} total, ${selectedCount} selected`,
          )}
        </div>
        <div className={"text-sm " + mutedClass}>
          {t(
            `已加载 ${items.length}/${total || items.length} 张，当前筛选显示 ${filteredItems.length} 张`,
            `${items.length}/${total || items.length} loaded, ${filteredItems.length} visible after filters`,
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void selectAllResults()}
            disabled={total === 0 || isSelectingAll || isMutating}
            className={neutralButtonClass}
          >
            {isSelectingAll ? t("全选中...", "Selecting...") : t("全选所有", "Select All")}
          </button>
          <button type="button" onClick={toggleFiltered} disabled={filteredItems.length === 0 || isMutating} className={neutralButtonClass}>
            {allFilteredSelected ? t("取消当前页", "Deselect Page") : t("全选当前页", "Select Page")}
          </button>
          <button
            type="button"
            onClick={() => void mutateSelected(Array.from(selected), "promote")}
            disabled={selectedCount === 0 || isMutating}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isMutating ? t("处理中", "Working") : t("选中入素材库", "Import Selected")}
          </button>
          <button
            type="button"
            onClick={() => void mutateSelected(Array.from(selected), "risk-library")}
            disabled={selectedCount === 0 || isMutating}
            className={riskButtonClass}
          >
            {isMutating ? t("处理中", "Working") : t("选中入风险库", "Add to Risk Library")}
          </button>
          <button
            type="button"
            onClick={() => void mutateSelected(Array.from(selected), "delete")}
            disabled={selectedCount === 0 || isMutating}
            className="rounded-md border border-red-400 px-3 py-2 text-sm font-medium text-red-500 transition hover:-translate-y-0.5 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("删除选中", "Delete Selected")}
          </button>
        </div>
      </div>

      {message ? <p className="ui-enter rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{message}</p> : null}
      {error ? <pre className="ui-enter whitespace-pre-wrap rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</pre> : null}

      {filteredItems.length === 0 ? (
        <section className={"ui-enter rounded-md border p-8 text-center " + panelClass}>
          <p className={"text-sm " + mutedClass}>
            {isLoading ? t("正在读取采集库...", "Loading collector library...") : t("暂无采集图片", "No collected images yet")}
          </p>
          {isLoading ? (
            <>
              <span className="ui-spinner ui-spinner-lg mx-auto mt-4 text-cyan-400" aria-hidden="true" />
              <div className={["mx-auto mt-4 h-1.5 max-w-sm overflow-hidden rounded-full", isDark ? "bg-white/[0.08]" : "bg-zinc-100"].join(" ")}>
                <div className="ui-progress-fill h-full w-2/3 rounded-full bg-cyan-500" />
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredItems.map((item) => {
            const isSelected = selected.has(item.relativePath);
            const uploadDate = getUploadDate(item);
            const pendingMode = pendingMutationPaths.has(item.relativePath) ? pendingMutationMode : null;
            const isItemMutating = pendingMode !== null;

            return (
              <article
                key={item.relativePath}
                onClick={() => {
                  if (!isItemMutating) toggleItem(item.relativePath);
                }}
                data-task-active={isItemMutating}
                className={[
                  "ui-enter ui-lift ui-task-card group overflow-hidden rounded-md border transition-[border-color,box-shadow,transform] duration-150 ease-out",
                  isDark ? "bg-white/[0.03]" : "bg-white",
                  isSelected ? "border-emerald-500 ring-2 ring-emerald-500/20" : isDark ? "border-white/[0.08]" : "border-zinc-200",
                ].join(" ")}
              >
                <div className={isDark ? "relative aspect-[4/5] bg-zinc-950/90 p-2" : "relative aspect-[4/5] bg-zinc-100 p-2"}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleItem(item.relativePath)}
                    disabled={isItemMutating}
                    className="absolute left-3 top-3 z-10 h-4 w-4 rounded border-zinc-300"
                  />
                  <img
                    src={getDisplayImageSrc(item.publicUrl)}
                    alt={item.filename}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full rounded-md object-contain"
                  />
                  {isItemMutating ? (
                    <div className="ui-task-overlay z-20 flex-col gap-3">
                      <span className="ui-spinner ui-spinner-md text-cyan-200" aria-hidden="true" />
                      <span className="ui-task-label rounded-full bg-black/35 px-3 py-1">{mutationLabel(pendingMode)}</span>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <h3 className={"truncate text-sm font-semibold " + textClass} title={item.filename}>
                      {item.filename}
                    </h3>
                    <p className={"mt-1 truncate text-xs " + mutedClass} title={item.relativePath}>
                      {item.employeeName} / {t("上传", "Uploaded")} {uploadDate} / {item.siteType}
                    </p>
                  </div>
                  <div className={"grid grid-cols-2 gap-2 text-xs " + mutedClass}>
                    <span>{item.width && item.height ? item.width + " x " + item.height : t("尺寸未知", "Unknown size")}</span>
                    <span className="text-right">{formatFileSize(item.fileSize)}</span>
                  </div>
                  <p className={"truncate text-xs " + mutedClass} title={item.sourceUrl || item.pageUrl || ""}>
                    {item.sourceUrl || item.pageUrl || t("无来源链接", "No source URL")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewPath(item.relativePath);
                      }}
                      className={neutralButtonClass + " text-center"}
                    >
                      {t("预览", "Preview")}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void mutateSelected([item.relativePath], "promote");
                      }}
                      disabled={isMutating}
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingMode === "promote" ? t("入素材库中", "Importing") : t("入素材库", "Assets")}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void mutateSelected([item.relativePath], "risk-library");
                      }}
                      disabled={isMutating}
                      className={riskButtonClass}
                    >
                      {pendingMode === "risk-library" ? t("入风险库中", "Adding") : t("入风险库", "Risk")}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void mutateSelected([item.relativePath], "delete");
                      }}
                      disabled={isMutating}
                      className="rounded-md border border-red-400 px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingMode === "delete" ? t("删除中", "Deleting") : t("删除", "Delete")}
                    </button>
                  </div>
                  <p className={"text-[11px] " + mutedClass}>{t("上传时间", "Uploaded at")}: {formatDate(item.createdAt)}</p>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <Pagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        unitZh="张"
        unitEn="images"
        onChange={(nextPage) => {
          setPage(nextPage);
          window.scrollTo({ behavior: "smooth", top: 0 });
        }}
      />

      {previewItem && isMounted ? createPortal((
        <div
          className="ui-modal-overlay fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-4 sm:px-6 sm:py-6"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewPath(null);
            }
          }}
        >
          <div
            className={[
              "ui-modal-panel relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-md border shadow-2xl sm:max-h-[calc(100vh-3rem)]",
              isDark ? "border-white/[0.10] bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-950",
            ].join(" ")}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={["flex items-start justify-between gap-4 border-b px-5 py-4", isDark ? "border-white/[0.08]" : "border-zinc-200"].join(" ")}>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{previewItem.filename}</h2>
                <p className={"mt-1 truncate text-sm " + mutedClass}>
                  {previewItem.employeeName} / {t("上传", "Uploaded")} {getUploadDate(previewItem)} / {previewItem.siteType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPath(null)}
                className={neutralButtonClass + " h-9 w-9 shrink-0 px-0 text-lg leading-none"}
                aria-label={t("关闭预览", "Close preview")}
              >
                x
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className={isDark ? "min-h-[55vh] overflow-auto bg-black" : "min-h-[55vh] overflow-auto bg-zinc-100"}>
                <div className="flex min-h-[55vh] items-center justify-center p-4">
                  <img
                    src={getDisplayImageSrc(previewItem.publicUrl)}
                    alt={previewItem.filename}
                    className="max-h-[72vh] max-w-full object-contain"
                  />
                </div>
              </div>

              <aside className={["space-y-4 overflow-y-auto border-l p-5", isDark ? "border-white/[0.08]" : "border-zinc-200"].join(" ")}>
                <div>
                  <p className={"text-xs font-medium " + mutedClass}>{t("图片信息", "Image Info")}</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className={mutedClass}>{t("尺寸", "Size")}</dt>
                      <dd className="text-right font-medium">
                        {previewItem.width && previewItem.height ? previewItem.width + " x " + previewItem.height : t("尺寸未知", "Unknown size")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className={mutedClass}>{t("文件大小", "File Size")}</dt>
                      <dd className="text-right font-medium">{formatFileSize(previewItem.fileSize)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className={mutedClass}>{t("格式", "Format")}</dt>
                      <dd className="text-right font-medium">{previewItem.format || "-"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className={mutedClass}>{t("上传时间", "Uploaded At")}</dt>
                      <dd className="text-right font-medium">{formatDate(previewItem.createdAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <p className={"text-xs font-medium " + mutedClass}>{t("来源", "Source")}</p>
                  <p className={"mt-2 break-all text-sm leading-6 " + mutedClass}>
                    {previewItem.sourceUrl || previewItem.pageUrl || t("无来源链接", "No source URL")}
                  </p>
                </div>

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadCollectorItem(previewItem)}
                    className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:-translate-y-0.5 hover:bg-cyan-400"
                  >
                    {t("下载到本地", "Download")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutateSelected([previewItem.relativePath], "promote")}
                    disabled={isMutating}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {previewPendingMode === "promote" ? t("正在入素材库", "Importing to assets") : t("入素材库", "Import to Assets")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutateSelected([previewItem.relativePath], "risk-library")}
                    disabled={isMutating}
                    className={riskButtonClass}
                  >
                    {previewPendingMode === "risk-library" ? t("正在入风险库", "Adding to risk library") : t("入风险库", "Add to Risk Library")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void mutateSelected([previewItem.relativePath], "delete")}
                    disabled={isMutating}
                    className="rounded-md border border-red-400 px-4 py-2 text-sm font-medium text-red-500 transition hover:-translate-y-0.5 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {previewPendingMode === "delete" ? t("正在删除", "Deleting") : t("删除", "Delete")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewPath(null)}
                    className={neutralButtonClass}
                  >
                    {t("关闭", "Close")}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
