"use client";

import { useEffect, useMemo, useState } from "react";

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
  width: number | null;
};

type CollectorMutationResult = {
  error?: string;
  relative_path?: string;
  success: boolean;
};

type CollectorResponse = {
  error?: string;
  failed_count?: number;
  items?: CollectorLibraryItem[];
  results?: CollectorMutationResult[];
  success_count?: number;
  total?: number;
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
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

export function CollectorLibraryManager() {
  const { isDark, t } = useSettings();
  const [items, setItems] = useState<CollectorLibraryItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const employees = useMemo(() => uniqueSorted(items.map((item) => item.employeeName)), [items]);
  const dates = useMemo(() => uniqueSorted(items.map((item) => item.date)).reverse(), [items]);
  const sites = useMemo(() => uniqueSorted(items.map((item) => item.siteType)), [items]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return items.filter((item) => {
      if (employeeFilter !== "all" && item.employeeName !== employeeFilter) return false;
      if (dateFilter !== "all" && item.date !== dateFilter) return false;
      if (siteFilter !== "all" && item.siteType !== siteFilter) return false;
      if (!keyword) return true;

      return [item.filename, item.relativePath, item.sourceUrl || "", item.pageUrl || ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [dateFilter, employeeFilter, items, query, siteFilter]);

  const selectedCount = selected.size;
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selected.has(item.relativePath));
  const panelClass = isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-zinc-200 bg-white";
  const mutedClass = isDark ? "text-zinc-400" : "text-zinc-500";
  const textClass = isDark ? "text-white" : "text-zinc-950";
  const inputClass = isDark
    ? "border-white/[0.10] bg-zinc-950/70 text-white"
    : "border-zinc-300 bg-white text-zinc-900";
  const buttonClass =
    "rounded-md border px-3 py-2 text-sm font-medium transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
  const neutralButtonClass = isDark
    ? buttonClass + " border-white/[0.10] text-zinc-200 hover:bg-white/[0.06]"
    : buttonClass + " border-zinc-300 text-zinc-800 hover:bg-zinc-100";

  async function loadItems() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/collector-library?limit=3000", { cache: "no-store" });
      const data = (await response.json()) as CollectorResponse;

      if (!response.ok) {
        throw new Error(data.error || t("读取采集库失败", "Failed to load collector library"));
      }

      const nextItems = data.items || [];
      setItems(nextItems);
      setSelected((current) => {
        const knownPaths = new Set(nextItems.map((item) => item.relativePath));
        return new Set(Array.from(current).filter((path) => knownPaths.has(path)));
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取采集库失败", "Failed to load collector library"));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

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

  async function mutateSelected(paths: string[], mode: "delete" | "promote") {
    if (paths.length === 0) {
      setError(t("请先选择图片", "Please select images first"));
      return;
    }

    if (mode === "delete" && !window.confirm(t("确认删除选中的采集图片？", "Delete selected collector images?"))) {
      return;
    }

    setIsMutating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/collector-library", {
        body: JSON.stringify(mode === "promote" ? { action: "promote", relative_paths: paths } : { relative_paths: paths }),
        headers: { "Content-Type": "application/json" },
        method: mode === "promote" ? "POST" : "DELETE",
      });
      const data = (await response.json()) as CollectorResponse;
      const results = data.results || [];
      const successPaths = new Set(
        results.filter((result) => result.success && result.relative_path).map((result) => result.relative_path as string),
      );

      if (!response.ok && successPaths.size === 0) {
        throw new Error(data.error || t("操作失败", "Operation failed"));
      }

      setItems((current) => current.filter((item) => !successPaths.has(item.relativePath)));
      setSelected((current) => new Set(Array.from(current).filter((path) => !successPaths.has(path))));
      setMessage(
        mode === "promote"
          ? t("入库成功 " + (data.success_count || 0) + " 张，失败 " + (data.failed_count || 0) + " 张", (data.success_count || 0) + " imported, " + (data.failed_count || 0) + " failed")
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
    }
  }

  return (
    <div className="space-y-4">
      <section className={"rounded-md border p-4 " + panelClass}>
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]">
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
            <span className={textClass}>{t("日期", "Date")}</span>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className={"mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none " + inputClass}
            >
              <option value="all">{t("全部", "All")}</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
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
          <button type="button" onClick={() => void loadItems()} disabled={isLoading || isMutating} className={neutralButtonClass + " self-end"}>
            {isLoading ? t("刷新中", "Refreshing") : t("刷新", "Refresh")}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={"text-sm " + mutedClass}>
          {t("共 " + filteredItems.length + " 张，已选 " + selectedCount + " 张", filteredItems.length + " total, " + selectedCount + " selected")}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={toggleFiltered} disabled={filteredItems.length === 0 || isMutating} className={neutralButtonClass}>
            {allFilteredSelected ? t("取消全选", "Deselect") : t("全选当前", "Select Visible")}
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
            onClick={() => void mutateSelected(Array.from(selected), "delete")}
            disabled={selectedCount === 0 || isMutating}
            className="rounded-md border border-red-400 px-3 py-2 text-sm font-medium text-red-500 transition hover:-translate-y-0.5 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("删除选中", "Delete Selected")}
          </button>
        </div>
      </div>

      {message ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{message}</p> : null}
      {error ? <pre className="whitespace-pre-wrap rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</pre> : null}

      {filteredItems.length === 0 ? (
        <section className={"rounded-md border p-8 text-center " + panelClass}>
          <p className={"text-sm " + mutedClass}>
            {isLoading ? t("正在读取采集库...", "Loading collector library...") : t("暂无采集图片", "No collected images yet")}
          </p>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredItems.map((item) => {
            const isSelected = selected.has(item.relativePath);

            return (
              <article
                key={item.relativePath}
                onClick={() => toggleItem(item.relativePath)}
                className={[
                  "group overflow-hidden rounded-md border transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5",
                  isDark ? "bg-white/[0.03]" : "bg-white",
                  isSelected ? "border-emerald-500 ring-2 ring-emerald-500/20" : isDark ? "border-white/[0.08]" : "border-zinc-200",
                ].join(" ")}
              >
                <div className={isDark ? "relative aspect-square bg-zinc-950" : "relative aspect-square bg-zinc-100"}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleItem(item.relativePath)}
                    className="absolute left-3 top-3 z-10 h-4 w-4 rounded border-zinc-300"
                  />
                  <img
                    src={item.publicUrl}
                    alt={item.filename}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <h3 className={"truncate text-sm font-semibold " + textClass} title={item.filename}>
                      {item.filename}
                    </h3>
                    <p className={"mt-1 truncate text-xs " + mutedClass} title={item.relativePath}>
                      {item.employeeName} / {item.date} / {item.siteType}
                    </p>
                  </div>
                  <div className={"grid grid-cols-2 gap-2 text-xs " + mutedClass}>
                    <span>{item.width && item.height ? item.width + " x " + item.height : t("尺寸未知", "Unknown size")}</span>
                    <span className="text-right">{formatFileSize(item.fileSize)}</span>
                  </div>
                  <p className={"truncate text-xs " + mutedClass} title={item.sourceUrl || item.pageUrl || ""}>
                    {item.sourceUrl || item.pageUrl || t("无来源链接", "No source URL")}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <a
                      href={item.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className={neutralButtonClass + " text-center"}
                    >
                      {t("查看", "Open")}
                    </a>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void mutateSelected([item.relativePath], "promote");
                      }}
                      disabled={isMutating}
                      className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("入库", "Import")}
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
                      {t("删除", "Delete")}
                    </button>
                  </div>
                  <p className={"text-[11px] " + mutedClass}>{formatDate(item.createdAt)}</p>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
