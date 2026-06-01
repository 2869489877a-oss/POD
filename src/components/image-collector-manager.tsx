"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchCollectionTemplates, fetchCollectionRuns, saveCollectionTemplate, archiveCollectionTemplate, runCollectionTemplate } from "@/lib/actions/image-collector";
import type {
  ImageCollectionRun,
  ImageCollectionScheduleFrequency,
  ImageCollectionSourceInput,
  ImageCollectionTemplate,
} from "@/types/image-collector";

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

type TemplatesResponse = {
  error?: string;
  templates?: ImageCollectionTemplate[];
};

type RunsResponse = {
  error?: string;
  runs?: RunWithTemplateName[];
};

type SaveTemplateResponse = {
  error?: string;
  template?: ImageCollectionTemplate;
  templates?: ImageCollectionTemplate[];
};

type RunTemplateResponse = {
  error?: string;
  ok?: boolean;
  run?: RunDetail;
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

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "启用",
    archived: "已归档",
    completed: "完成",
    failed: "失败",
    partial_failed: "部分失败",
    pending: "待执行",
    processing: "处理中",
  };

  return labels[status] ?? status;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.status === "active"),
    [templates],
  );

  const refreshTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchCollectionTemplates(includeArchived);
      if (data.error) throw new Error(data.error);
      setTemplates(data.templates as ImageCollectionTemplate[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "读取采集模板失败");
    } finally {
      setIsLoading(false);
    }
  }, [includeArchived]);

  const refreshRuns = useCallback(async () => {
    try {
      const data = await fetchCollectionRuns();
      if (data.error) throw new Error(data.error);

      setRuns(data.runs as RunWithTemplateName[]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "读取采集历史失败");
    }
  }, []);

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
      setError("请至少添加一个网站来源");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = buildPayload(form);
      const data = await saveCollectionTemplate(payload, editingId);
      if (data.error) throw new Error(data.error);

      setMessage(editingId ? "采集模板已保存" : "采集模板已创建");
      resetForm();
      await refreshTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存采集模板失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveTemplate(template: ImageCollectionTemplate) {
    const confirmed = window.confirm("确定要归档这个采集模板吗？归档后不会在默认列表中显示。");

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

      setMessage("采集模板已归档");
      await refreshTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "归档采集模板失败");
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
      setMessage("采集任务已提交");
      await refreshRuns();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "运行采集模板失败");
    } finally {
      setIsRunningId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="space-y-6">
        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">采集模板列表</h3>
              <p className="mt-1 text-sm text-zinc-500">
                共 {templates.length} 个模板，启用 {activeTemplates.length} 个
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
                显示已归档
              </label>
              <button
                type="button"
                onClick={() => void refreshTemplates()}
                disabled={isLoading}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {isLoading ? "刷新中..." : "刷新模板"}
              </button>
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500">暂无采集模板，请先创建一个模板。</div>
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
                          {statusLabel(template.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-500">
                        主文件夹：{template.storage_prefix}/{"{yyyyMMdd-HHmmss}"}-
                        {template.main_folder_name}
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        来源 {template.sources.length} 个，关键词 {template.keywords.length} 个，最多下载{" "}
                        {template.max_images} 张
                      </p>
                      <p className="mt-1 text-sm text-zinc-500">
                        自动运行：{template.schedule_enabled ? template.cron_expression ?? "hourly" : "未启用"}
                        ，上次：{formatDateTime(template.last_run_at)}，下次：
                        {formatDateTime(template.next_run_at)}
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
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => void runTemplate(template)}
                        disabled={template.status !== "active" || isRunningId === template.id}
                        className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                      >
                        {isRunningId === template.id ? "创建中..." : "手动运行"}
                      </button>
                      {template.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void archiveTemplate(template)}
                          className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                        >
                          归档
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
            <h3 className="text-base font-semibold text-zinc-950">采集历史</h3>
            <p className="mt-1 text-sm text-zinc-500">展示最近采集运行记录和下载统计。</p>
          </div>
          {runs.length === 0 ? (
            <div className="p-5 text-sm text-zinc-500">暂无采集历史。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">模板</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">目录</th>
                    <th className="px-5 py-3 font-medium">下载</th>
                    <th className="px-5 py-3 font-medium">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-5 py-3 text-zinc-900">{run.template_name ?? "模板已删除"}</td>
                      <td className="px-5 py-3 text-zinc-600">{statusLabel(run.status)}</td>
                      <td className="max-w-[260px] truncate px-5 py-3 text-zinc-600">{run.root_folder}</td>
                      <td className="px-5 py-3 text-zinc-600">
                        {run.total_downloaded}/{run.total_found}，失败 {run.total_failed}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{formatDateTime(run.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {lastRun ? (
          <div className="rounded-md border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-950">本次采集结果</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  找到 {lastRun.total_found} 张，成功 {lastRun.total_downloaded} 张，失败{" "}
                  {lastRun.total_failed} 张
                </p>
                <p className="mt-1 max-w-3xl truncate text-sm text-zinc-500">
                  目录：{lastRun.root_folder}
                </p>
              </div>
              <a
                href="/assets"
                className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                去素材库查看
              </a>
            </div>

            {lastRun.error_message ? (
              <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                {lastRun.error_message}
              </div>
            ) : null}

            {lastRun.items.length === 0 ? (
              <div className="p-5 text-sm text-zinc-500">本次运行没有写入图片明细。</div>
            ) : (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {lastRun.items.map((item) => {
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
                          aria-label="打开采集图片"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400">
                          无图片
                        </div>
                      )}
                      <div className="mt-3 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-zinc-950">
                            {item.filename ?? item.source_site_name ?? "采集项"}
                          </p>
                          <span
                            className={[
                              "rounded-md px-2 py-1 text-xs font-medium",
                              item.status === "downloaded"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700",
                            ].join(" ")}
                          >
                            {item.status === "downloaded" ? "成功" : "失败"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {item.source_site_name ?? "未知来源"} / {item.source_folder_name ?? "-"}
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
          </div>
        ) : null}
      </section>

      <aside className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">
              {editingId ? "编辑采集模板" : "新建采集模板"}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">配置网站来源、关键词和保存目录逻辑前缀。</p>
          </div>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              新建
            </button>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-zinc-950">
            模板名称
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="例如：猫咪 T 恤素材采集"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-950">
            主文件夹名称
            <input
              value={form.mainFolderName}
              onChange={(event) =>
                setForm((current) => ({ ...current, mainFolderName: event.target.value }))
              }
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="例如：cat-shirts"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-950">
            上层目录逻辑路径
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
            关键词，逗号分隔
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
            下载图片数量
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
            启用自动运行
          </label>

          {form.scheduleEnabled ? (
            <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <label className="block text-sm font-medium text-zinc-950">
                自动运行频率
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
                  <option value="manual">手动</option>
                  <option value="hourly">每小时</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="custom">自定义 cron</option>
                </select>
              </label>

              {form.scheduleFrequency === "custom" ? (
                <label className="block text-sm font-medium text-zinc-950">
                  自定义 cron
                  <input
                    value={form.customCronExpression}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customCronExpression: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    placeholder="例如：*/30 * * * *"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-zinc-200">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-zinc-950">网站来源配置</h4>
              <button
                type="button"
                onClick={addSource}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
              >
                添加来源
              </button>
            </div>
            <div className="space-y-4 p-4">
              {form.sources.map((source, index) => (
                <div key={source.local_id} className="space-y-3 rounded-md bg-zinc-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-950">来源 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeSource(index)}
                      disabled={form.sources.length === 1}
                      className="text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      移除
                    </button>
                  </div>
                  <label className="block text-sm font-medium text-zinc-950">
                    网站名称
                    <input
                      value={source.site_name}
                      onChange={(event) => updateSource(index, { site_name: event.target.value })}
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      placeholder="例如：Example"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-950">
                    起始页面 URL
                    <input
                      value={source.start_url}
                      onChange={(event) => updateSource(index, { start_url: event.target.value })}
                      className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      placeholder="https://example.com/search?q={{keyword}}"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-950">
                    文件夹名称
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
                    启用该来源
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
            {isSaving ? "保存中..." : editingId ? "保存模板" : "创建模板"}
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
