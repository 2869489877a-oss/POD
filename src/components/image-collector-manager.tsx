"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchCollectionTemplates, fetchCollectionRuns, saveCollectionTemplate, archiveCollectionTemplate, runCollectionTemplate } from "@/lib/actions/image-collector";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";
import type {
  ImageCollectionRun,
  ImageCollectionScheduleFrequency,
  ImageCollectionSourceInput,
  ImageCollectionTemplate,
} from "@/types/image-collector";

const RUNS_PER_PAGE = 10;
const RUN_ITEMS_PER_PAGE = 12;

type RunWithTemplateName = ImageCollectionRun & {
  template_name: string | null;
};

type RunItemWithPreview = {
  asset_id: string | null;
  asset_original_url: string | null;
  error_message: string | null;
  filename: string | null;
  id: string;
  image_url: string | null;
  source_folder_name: string | null;
  source_page_url: string | null;
  source_site_name: string | null;
  status: string;
  storage_path: string | null;
};

type RunDetail = RunWithTemplateName & {
  items: RunItemWithPreview[];
};

type SourceDraft = ImageCollectionSourceInput & {
  local_id: string;
};

type TemplateFormState = {
  keywordsText: string;
  mainFolderName: string;
  maxImages: number;
  name: string;
  scheduleFrequency: ImageCollectionScheduleFrequency;
  scheduleEnabled: boolean;
  sources: SourceDraft[];
  storagePrefix: string;
  customCronExpression: string;
};

function createLocalId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankSource(): SourceDraft {
  return {
    enabled: true,
    folder_name: "",
    local_id: createLocalId(),
    site_name: "",
    start_url: "",
  };
}

function createBlankForm(): TemplateFormState {
  return {
    keywordsText: "",
    mainFolderName: "",
    maxImages: 50,
    name: "",
    scheduleFrequency: "manual",
    scheduleEnabled: false,
    sources: [createBlankSource()],
    storagePrefix: "collections",
    customCronExpression: "*/30 * * * *",
  };
}

function splitKeywords(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusLabel(status: string, translate: (zh: string, en: string) => string) {
  const labels: Record<string, { zh: string; en: string }> = {
    active: { zh: "启用", en: "Active" },
    archived: { zh: "已归档", en: "Archived" },
    completed: { zh: "完成", en: "Completed" },
    failed: { zh: "失败", en: "Failed" },
    partial_failed: { zh: "部分失败", en: "Partial Failed" },
    pending: { zh: "待执行", en: "Pending" },
    processing: { zh: "处理中", en: "Processing" },
  };

  return labels[status] ? translate(labels[status].zh, labels[status].en) : status;
}

function formatDateTime(value: string | null, locale: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function buildPayload(form: TemplateFormState) {
  const cronExpression =
    form.scheduleFrequency === "custom" ? form.customCronExpression.trim() : form.scheduleFrequency;

  return {
    cron_expression: form.scheduleEnabled ? cronExpression || "hourly" : "manual",
    keywords: splitKeywords(form.keywordsText),
    main_folder_name: form.mainFolderName.trim(),
    max_images: form.maxImages,
    name: form.name.trim(),
    schedule_enabled: form.scheduleEnabled && form.scheduleFrequency !== "manual",
    sources: form.sources.map((source) => ({
      enabled: source.enabled,
      folder_name: source.folder_name.trim(),
      options: source.options ?? {},
      site_name: source.site_name.trim(),
      start_url: source.start_url.trim(),
    })),
    storage_prefix: form.storagePrefix.trim() || "collections",
  };
}

function inferScheduleFrequency(cronExpression: string | null): ImageCollectionScheduleFrequency {
  if (
    cronExpression === "manual" ||
    cronExpression === "hourly" ||
    cronExpression === "daily" ||
    cronExpression === "weekly"
  ) {
    return cronExpression;
  }

  return cronExpression ? "custom" : "manual";
}

function templateToForm(template: ImageCollectionTemplate): TemplateFormState {
  const scheduleFrequency = inferScheduleFrequency(template.cron_expression);

  return {
    customCronExpression: scheduleFrequency === "custom" ? template.cron_expression ?? "*/30 * * * *" : "*/30 * * * *",
    keywordsText: template.keywords.join(", "),
    mainFolderName: template.main_folder_name,
    maxImages: template.max_images,
    name: template.name,
    scheduleEnabled: template.schedule_enabled,
    scheduleFrequency,
    sources:
      template.sources.length > 0
        ? template.sources.map((source) => ({
            enabled: source.enabled,
            folder_name: source.folder_name,
            local_id: createLocalId(),
            options: source.options,
            site_name: source.site_name,
            start_url: source.start_url,
          }))
        : [createBlankSource()],
    storagePrefix: template.storage_prefix,
  };
}

export function ImageCollectorManager() {
  const { language, t } = useSettings();
  const [templates, setTemplates] = useState<ImageCollectionTemplate[]>([]);
  const [runs, setRuns] = useState<RunWithTemplateName[]>([]);
  const [form, setForm] = useState<TemplateFormState>(() => createBlankForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningId, setIsRunningId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<RunDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [runItemsPage, setRunItemsPage] = useState(1);

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.status === "active"),
    [templates],
  );
  const runsTotalPages = Math.max(1, Math.ceil(runs.length / RUNS_PER_PAGE));
  const currentRunsPage = Math.min(runsPage, runsTotalPages);
  const pagedRuns = useMemo(
    () => runs.slice((currentRunsPage - 1) * RUNS_PER_PAGE, currentRunsPage * RUNS_PER_PAGE),
    [runs, currentRunsPage],
  );
  const runItems = useMemo(() => lastRun?.items ?? [], [lastRun]);
  const runItemsTotalPages = Math.max(1, Math.ceil(runItems.length / RUN_ITEMS_PER_PAGE));
  const currentRunItemsPage = Math.min(runItemsPage, runItemsTotalPages);
  const pagedRunItems = useMemo(
    () => runItems.slice((currentRunItemsPage - 1) * RUN_ITEMS_PER_PAGE, currentRunItemsPage * RUN_ITEMS_PER_PAGE),
    [runItems, currentRunItemsPage],
  );
  const runStatusRows = useMemo(() => {
    const statuses = ["pending", "processing", "completed", "partial_failed", "failed"];
    return statuses.map((status) => ({
      count: runs.filter((run) => run.status === status).length,
      status,
    }));
  }, [runs]);
  const maxRunStatusCount = Math.max(1, ...runStatusRows.map((row) => row.count));
  const totalFound = runs.reduce((sum, run) => sum + run.total_found, 0);
  const totalDownloaded = runs.reduce((sum, run) => sum + run.total_downloaded, 0);
  const totalFailed = runs.reduce((sum, run) => sum + run.total_failed, 0);
  const downloadRate = percent(totalDownloaded, totalFound);

  const refreshTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCollectionTemplates(includeArchived);
      if (data.error) throw new Error(data.error);
      setTemplates(data.templates as ImageCollectionTemplate[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取采集模板失败", "Failed to load collection templates"));
    } finally {
      setIsLoading(false);
    }
  }, [includeArchived, t]);

  const refreshRuns = useCallback(async () => {
    try {
      const data = await fetchCollectionRuns();
      if (data.error) throw new Error(data.error);

      setRuns(data.runs as RunWithTemplateName[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取采集历史失败", "Failed to load collection history"));
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshTemplates();
      void refreshRuns();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshRuns, refreshTemplates]);

  function updateSource(index: number, patch: Partial<SourceDraft>) {
    setForm((current) => ({
      ...current,
      sources: current.sources.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, ...patch } : source,
      ),
    }));
  }

  function addSource() {
    setForm((current) => ({
      ...current,
      sources: [...current.sources, createBlankSource()],
    }));
  }

  function removeSource(index: number) {
    setForm((current) => ({
      ...current,
      sources:
        current.sources.length > 1
          ? current.sources.filter((_, sourceIndex) => sourceIndex !== index)
          : current.sources,
    }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(createBlankForm());
  }

  async function saveTemplate() {
    if (form.sources.length === 0) {
      setError(t("请至少添加一个网站来源", "Please add at least one website source"));
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = buildPayload(form);
      const data = await saveCollectionTemplate(payload, editingId);
      if (data.error) throw new Error(data.error);

      setMessage(editingId ? t("采集模板已保存", "Collection template saved") : t("采集模板已创建", "Collection template created"));
      resetForm();
      await refreshTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("保存采集模板失败", "Failed to save collection template"));
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveTemplate(template: ImageCollectionTemplate) {
    const confirmed = window.confirm(t("确定要归档这个采集模板吗？归档后不会在默认列表中显示。", "Archive this collection template? It will no longer appear in the default list."));

    if (!confirmed) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const data = await archiveCollectionTemplate(template.id);
      if (data.error) throw new Error(data.error);

      if (editingId === template.id) {
        resetForm();
      }

      setMessage(t("采集模板已归档", "Collection template archived"));
      await refreshTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("归档采集模板失败", "Failed to archive collection template"));
    }
  }

  async function runTemplate(template: ImageCollectionTemplate) {
    setIsRunningId(template.id);
    setError(null);
    setMessage(null);

    try {
      const data = await runCollectionTemplate(template.id);
      if (data.error) throw new Error(data.error);

      setLastRun(data.run as RunDetail | null);
      setRunItemsPage(1);
      setMessage(t("采集任务已提交", "Collection job submitted"));
      await refreshRuns();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("运行采集模板失败", "Failed to run collection template"));
    } finally {
      setIsRunningId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="rounded-md border border-zinc-200 bg-white p-5 xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("采集任务观察面板", "Collection Overview")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t("查看模板启用情况、历史采集成功率和最近任务状态。", "Review active templates, historical success rate, and recent run status.")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-md bg-zinc-50 px-3 py-2">
              <p className="text-zinc-500">{t("模板总数", "Templates")}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">{templates.length}</p>
            </div>
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
              <p>{t("启用模板", "Active")}</p>
              <p className="mt-1 text-lg font-semibold">{activeTemplates.length}</p>
            </div>
            <div className="rounded-md bg-sky-50 px-3 py-2 text-sky-800">
              <p>{t("历史采集", "Runs")}</p>
              <p className="mt-1 text-lg font-semibold">{runs.length}</p>
            </div>
            <div className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
              <p>{t("成功率", "Success")}</p>
              <p className="mt-1 text-lg font-semibold">{downloadRate}%</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-950">{t("采集结果累计", "Collected Totals")}</p>
            <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3">
              <span>{t("发现", "Found")} <b className="text-zinc-950">{totalFound}</b></span>
              <span>{t("成功", "Downloaded")} <b className="text-emerald-700">{totalDownloaded}</b></span>
              <span>{t("失败", "Failed")} <b className="text-red-700">{totalFailed}</b></span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${downloadRate}%` }} />
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-950">{t("运行状态分布", "Run Status")}</p>
            <div className="mt-4 space-y-3">
              {runStatusRows.map((row) => (
                <div key={row.status}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-600">
                    <span>{statusLabel(row.status, t)}</span>
                    <span>{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={[
                        "h-full rounded-full",
                        row.status === "completed" ? "bg-emerald-600" : row.status === "failed" ? "bg-red-500" : row.status === "processing" ? "bg-sky-500" : row.status === "partial_failed" ? "bg-amber-500" : "bg-zinc-500",
                      ].join(" ")}
                      style={{ width: `${row.count > 0 ? Math.max(5, percent(row.count, maxRunStatusCount)) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">{t("采集模板列表", "Collection Templates")}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {t(`共 ${templates.length} 个模板，启用 ${activeTemplates.length} 个`, `${templates.length} templates, ${activeTemplates.length} active`)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {t("显示已归档", "Show Archived")}
              </label>
              <button
                type="button"
                onClick={() => void refreshTemplates()}
                disabled={isLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {isLoading ? t("刷新中...", "Refreshing...") : t("刷新模板", "Refresh Templates")}
              </button>
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500">{t("暂无采集模板，请先创建一个模板。", "No collection templates yet. Create one first.")}</div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {templates.map((template) => (
                <article key={template.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-zinc-950">{template.name}</h4>
                        <span
                          className={[
                            "rounded-md px-2 py-1 text-xs font-medium",
                            template.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-500",
                          ].join(" ")}
                        >
                          {statusLabel(template.status, t)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-500">
                        {t("主文件夹：", "Main folder: ")}{template.storage_prefix}/{"{yyyyMMdd-HHmmss}"}-
                        {template.main_folder_name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {t(`来源 ${template.sources.length} 个，关键词 ${template.keywords.length} 个，最多下载 ${template.max_images} 张`, `${template.sources.length} sources, ${template.keywords.length} keywords, max ${template.max_images} images`)}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        {t("自动运行：", "Auto run: ")}{template.schedule_enabled ? template.cron_expression ?? "hourly" : t("未启用", "Disabled")}
                        {t("，上次：", ", last: ")}{formatDateTime(template.last_run_at, language === "zh" ? "zh-CN" : "en-US")}{t("，下次：", ", next: ")}
                        {formatDateTime(template.next_run_at, language === "zh" ? "zh-CN" : "en-US")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(template.id);
                          setForm(templateToForm(template));
                          setMessage(null);
                          setError(null);
                        }}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                      >
                        {t("编辑", "Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runTemplate(template)}
                        disabled={template.status !== "active" || isRunningId === template.id}
                        className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                      >
                        {isRunningId === template.id ? t("创建中...", "Creating...") : t("手动运行", "Run Manually")}
                      </button>
                      {template.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void archiveTemplate(template)}
                          className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                        >
                          {t("归档", "Archive")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h3 className="text-base font-semibold text-zinc-950">{t("采集历史", "Collection History")}</h3>
            <p className="mt-1 text-sm text-zinc-500">{t("展示最近采集运行记录和下载统计。", "Shows recent collection runs and download statistics.")}</p>
          </div>
          {runs.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500">{t("暂无采集历史。", "No collection history yet.")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">{t("模板", "Template")}</th>
                    <th className="px-5 py-3 font-medium">{t("状态", "Status")}</th>
                    <th className="px-5 py-3 font-medium">{t("目录", "Folder")}</th>
                    <th className="px-5 py-3 font-medium">{t("下载", "Downloads")}</th>
                    <th className="px-5 py-3 font-medium">{t("时间", "Time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {pagedRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="px-5 py-3 text-zinc-900">{run.template_name ?? t("模板已删除", "Template deleted")}</td>
                      <td className="px-5 py-3 text-zinc-600">{statusLabel(run.status, t)}</td>
                      <td className="max-w-[260px] truncate px-5 py-3 text-zinc-600">{run.root_folder}</td>
                      <td className="px-5 py-3 text-zinc-600">
                        {t(`${run.total_downloaded}/${run.total_found}，失败 ${run.total_failed}`, `${run.total_downloaded}/${run.total_found}, failed ${run.total_failed}`)}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{formatDateTime(run.created_at, language === "zh" ? "zh-CN" : "en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {runs.length > 0 ? (
            <div className="px-5 pb-5">
              <Pagination
                page={currentRunsPage}
                totalPages={runsTotalPages}
                total={runs.length}
                unitZh="次"
                unitEn="runs"
                onChange={setRunsPage}
              />
            </div>
          ) : null}
        </div>

        {lastRun ? (
          <div className="rounded-md border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-950">{t("本次采集结果", "Latest Collection Result")}</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {t(`找到 ${lastRun.total_found} 张，成功 ${lastRun.total_downloaded} 张，失败 ${lastRun.total_failed} 张`, `Found ${lastRun.total_found}, downloaded ${lastRun.total_downloaded}, failed ${lastRun.total_failed}`)}
                </p>
                <p className="mt-1 max-w-3xl truncate text-sm text-zinc-500">
                  {t("目录：", "Folder: ")}{lastRun.root_folder}
                </p>
              </div>
              <a
                href="/assets"
                className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                {t("去素材库查看", "View in Assets")}
              </a>
            </div>

            {lastRun.error_message ? (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                {lastRun.error_message}
              </div>
            ) : null}

            {lastRun.items.length === 0 ? (
              <div className="p-5 text-sm text-zinc-500">{t("本次运行没有写入图片明细。", "This run did not write any image details.")}</div>
            ) : (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {pagedRunItems.map((item) => {
                  const previewUrl = item.asset_original_url ?? item.image_url;

                  return (
                    <article key={item.id} className="rounded-md border border-zinc-200 p-3">
                      {previewUrl ? (
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block aspect-square rounded-md bg-zinc-100 bg-cover bg-center"
                          style={{ backgroundImage: `url("${previewUrl}")` }}
                          aria-label={t("打开采集图片", "Open collected image")}
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400">
                          {t("无图片", "No image")}
                        </div>
                      )}
                      <div className="mt-3 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-zinc-950">
                            {item.filename ?? item.source_site_name ?? t("采集项", "Collection item")}
                          </p>
                          <span
                            className={[
                              "rounded-md px-2 py-1 text-xs font-medium",
                              item.status === "downloaded"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700",
                            ].join(" ")}
                          >
                            {item.status === "downloaded" ? t("成功", "Success") : t("失败", "Failed")}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {item.source_site_name ?? t("未知来源", "Unknown source")} / {item.source_folder_name ?? "-"}
                        </p>
                        {item.error_message ? (
                          <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                            {item.error_message}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {runItems.length > 0 ? (
              <div className="px-5 pb-5">
                <Pagination
                  page={currentRunItemsPage}
                  totalPages={runItemsTotalPages}
                  total={runItems.length}
                  unitZh="张"
                  unitEn="images"
                  onChange={setRunItemsPage}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">
              {editingId ? t("编辑采集模板", "Edit Collection Template") : t("新建采集模板", "New Collection Template")}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">{t("配置网站来源、关键词和保存目录逻辑前缀。", "Configure website sources, keywords, and storage path prefixes.")}</p>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              {t("新建", "New")}
            </button>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-zinc-950">
            {t("模板名称", "Template Name")}
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder={t("例如：猫咪 T 恤素材采集", "e.g. Cat T-shirt asset collection")}
            />
          </label>

          <label className="block text-sm font-medium text-zinc-950">
            {t("主文件夹名称", "Main Folder Name")}
            <input
              value={form.mainFolderName}
              onChange={(event) =>
                setForm((current) => ({ ...current, mainFolderName: event.target.value }))
              }
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder={t("例如：cat-shirts", "e.g. cat-shirts")}
            />
          </label>

          <label className="block text-sm font-medium text-zinc-950">
            {t("上层目录逻辑路径", "Parent Storage Prefix")}
            <input
              value={form.storagePrefix}
              onChange={(event) =>
                setForm((current) => ({ ...current, storagePrefix: event.target.value }))
              }
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="collections"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-950">
            {t("关键词，逗号分隔", "Keywords, comma-separated")}
            <input
              value={form.keywordsText}
              onChange={(event) =>
                setForm((current) => ({ ...current, keywordsText: event.target.value }))
              }
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="cat shirt, dog hoodie"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-950">
            {t("下载图片数量", "Image Download Limit")}
            <input
              type="number"
              min={1}
              max={500}
              value={form.maxImages}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxImages: Number(event.target.value) }))
              }
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={form.scheduleEnabled}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  scheduleEnabled: event.target.checked,
                  scheduleFrequency:
                    event.target.checked && current.scheduleFrequency === "manual"
                      ? "hourly"
                      : current.scheduleFrequency,
                }))
              }
              className="h-4 w-4 rounded border-zinc-300"
            />
            {t("启用自动运行", "Enable Auto Run")}
          </label>

          {form.scheduleEnabled ? (
            <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <label className="block text-sm font-medium text-zinc-950">
                {t("自动运行频率", "Auto Run Frequency")}
                <select
                  value={form.scheduleFrequency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduleFrequency: event.target.value as ImageCollectionScheduleFrequency,
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="manual">{t("手动", "Manual")}</option>
                  <option value="hourly">{t("每小时", "Hourly")}</option>
                  <option value="daily">{t("每天", "Daily")}</option>
                  <option value="weekly">{t("每周", "Weekly")}</option>
                  <option value="custom">{t("自定义 cron", "Custom cron")}</option>
                </select>
              </label>

              {form.scheduleFrequency === "custom" ? (
                <label className="block text-sm font-medium text-zinc-950">
                  {t("自定义 cron", "Custom cron")}
                  <input
                    value={form.customCronExpression}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customCronExpression: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    placeholder={t("例如：*/30 * * * *", "e.g. */30 * * * *")}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-zinc-200">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-zinc-950">{t("网站来源配置", "Website Source Config")}</h4>
              <button
                type="button"
                onClick={addSource}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
              >
                {t("添加来源", "Add Source")}
              </button>
            </div>
            <div className="space-y-4 p-4">
              {form.sources.map((source, index) => (
                <div key={source.local_id} className="space-y-3 rounded-md bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-950">{t(`来源 ${index + 1}`, `Source ${index + 1}`)}</span>
                    <button
                      type="button"
                      onClick={() => removeSource(index)}
                      disabled={form.sources.length === 1}
                      className="text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      {t("移除", "Remove")}
                    </button>
                  </div>
                  <label className="block text-sm font-medium text-zinc-950">
                    {t("网站名称", "Website Name")}
                    <input
                      value={source.site_name}
                      onChange={(event) => updateSource(index, { site_name: event.target.value })}
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      placeholder={t("例如：Example", "e.g. Example")}
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-950">
                    {t("起始页面 URL", "Start Page URL")}
                    <input
                      value={source.start_url}
                      onChange={(event) => updateSource(index, { start_url: event.target.value })}
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      placeholder="https://example.com/search?q={{keyword}}"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-950">
                    {t("文件夹名称", "Folder Name")}
                    <input
                      value={source.folder_name}
                      onChange={(event) => updateSource(index, { folder_name: event.target.value })}
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      placeholder="example"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(event) => updateSource(index, { enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {t("启用该来源", "Enable this source")}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void saveTemplate()}
            disabled={isSaving}
            className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isSaving ? t("保存中...", "Saving...") : editingId ? t("保存模板", "Save Template") : t("创建模板", "Create Template")}
          </button>

          {message ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
