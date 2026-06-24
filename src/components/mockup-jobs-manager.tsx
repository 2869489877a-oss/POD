"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { createMockupJob } from "@/lib/actions/mockup-jobs";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";
import { getDisplayImageSrc } from "@/lib/local-asset-url";

const ASSETS_PER_PAGE = 12;

import type { MockupScene } from "@/lib/mockups/scenes";

export type MockupJobAsset = {
  cutout_url: string | null;
  filename: string;
  id: string;
  original_url: string;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
  status: string;
};

export type MockupJobTemplate = {
  id: string;
  name: string;
  product_type: string;
  scenes: MockupScene[];
  status: string;
};

type MockupOutputStatus = "completed" | "failed" | "pending" | "processing";

type MockupJobOutput = {
  asset_id: string;
  error_message: string | null;
  filename: string;
  item_id: string;
  mockup_output_id: string | null;
  output_images: string[];
  status: MockupOutputStatus;
};

type MockupJobStatus = "completed" | "failed" | "partial_failed" | "pending" | "processing";

type MockupJobResult = {
  failed_count: number;
  id: string;
  outputs: MockupJobOutput[];
  status: MockupJobStatus;
  success_count: number;
  total_count: number;
};

type MockupOutputZipResponse = {
  count?: number;
  download_url?: string;
  error?: string;
  filename?: string;
};

type MockupJobsManagerProps = {
  assets: MockupJobAsset[];
  initialError?: string | null;
  templates: MockupJobTemplate[];
};

type QueuedMockupJobItem = {
  asset_id: string;
  error_message: string | null;
  id: string;
  input_url: string;
  mockup_output_id?: string | null;
  output_images?: string[];
  output_url: string | null;
  status: string;
};

type QueuedMockupJob = {
  failed_count: number;
  id: string;
  items: QueuedMockupJobItem[];
  status: string;
  success_count: number;
  total_count: number;
};

type QueuedMockupJobResponse = {
  error?: string;
  job?: QueuedMockupJob;
};

const MOCKUP_POLL_INTERVAL_MS = 2000;
const MOCKUP_MAX_POLLS = 300;
const TERMINAL_MOCKUP_STATUSES = new Set<MockupJobStatus>(["completed", "failed", "partial_failed"]);

const jobStatusLabels: Record<MockupJobResult["status"], { zh: string; en: string }> = {
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  partial_failed: { zh: "部分失败", en: "Partial Failed" },
  pending: { zh: "排队中", en: "Queued" },
  processing: { zh: "处理中", en: "Processing" },
};

const outputStatusLabels: Record<MockupOutputStatus, { zh: string; en: string }> = {
  completed: { zh: "生成成功", en: "Generated" },
  failed: { zh: "生成失败", en: "Failed" },
  pending: { zh: "排队中", en: "Queued" },
  processing: { zh: "处理中", en: "Processing" },
};

function outputStatusClass(status: MockupOutputStatus) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "processing") return "bg-cyan-50 text-cyan-700";
  return "bg-zinc-100 text-zinc-600";
}

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

function pickAssetPreviewUrl(asset: MockupJobAsset) {
  return (
    asset.preferred_design_url ??
    asset.print_extract_url ??
    asset.cutout_url ??
    asset.processed_url ??
    asset.original_url
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMockupStatus(status: unknown): MockupJobStatus {
  return status === "completed" ||
    status === "failed" ||
    status === "partial_failed" ||
    status === "pending" ||
    status === "processing"
    ? status
    : "processing";
}

function normalizeMockupOutputStatus(status: unknown): MockupOutputStatus {
  return status === "completed" || status === "failed" || status === "pending" || status === "processing"
    ? status
    : "processing";
}

function filenameFromUrl(url: string) {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "image");
  } catch {
    return "image";
  }
}

function buildMockupResultFromQueuedJob(
  job: QueuedMockupJob,
  assetById: Map<string, MockupJobAsset>,
): MockupJobResult {
  return {
    failed_count: job.failed_count,
    id: job.id,
    outputs: job.items.map((item) => {
      const asset = assetById.get(item.asset_id);
      const outputImages =
        Array.isArray(item.output_images) && item.output_images.length > 0
          ? item.output_images
          : item.output_url
            ? [item.output_url]
            : [];

      return {
        asset_id: item.asset_id,
        error_message: item.error_message,
        filename: asset?.filename ?? filenameFromUrl(item.input_url),
        item_id: item.id,
        mockup_output_id: item.mockup_output_id ?? null,
        output_images: outputImages,
        status: normalizeMockupOutputStatus(item.status),
      };
    }),
    status: normalizeMockupStatus(job.status),
    success_count: job.success_count,
    total_count: job.total_count,
  };
}

export function MockupJobsManager({
  assets,
  initialError = null,
  templates,
}: MockupJobsManagerProps) {
  const { t } = useSettings();
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [jobResult, setJobResult] = useState<MockupJobResult | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadingOutputId, setDownloadingOutputId] = useState<string | null>(null);
  const [downloadResults, setDownloadResults] = useState<Record<string, MockupOutputZipResponse>>({});
  const [assetsPage, setAssetsPage] = useState(1);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  );
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.has(asset.id)),
    [assets, selectedAssetIds],
  );
  const assetsTotalPages = Math.max(1, Math.ceil(assets.length / ASSETS_PER_PAGE));
  const currentAssetsPage = Math.min(assetsPage, assetsTotalPages);
  const pagedAssets = useMemo(
    () => assets.slice((currentAssetsPage - 1) * ASSETS_PER_PAGE, currentAssetsPage * ASSETS_PER_PAGE),
    [assets, currentAssetsPage],
  );
  const jobDoneCount = jobResult ? jobResult.success_count + jobResult.failed_count : 0;
  const jobProgress =
    jobResult && jobResult.total_count > 0
      ? Math.min(100, Math.round((jobDoneCount / jobResult.total_count) * 100))
      : 0;

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) => {
      const next = new Set(current);

      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }

      return next;
    });
  }

  function toggleAllAssets() {
    setSelectedAssetIds((current) => {
      if (assets.length > 0 && assets.every((asset) => current.has(asset.id))) {
        return new Set();
      }

      return new Set(assets.map((asset) => asset.id));
    });
  }

  async function waitForMockupJob(jobId: string, assetById: Map<string, MockupJobAsset>) {
    for (let attempt = 0; attempt < MOCKUP_MAX_POLLS; attempt += 1) {
      await sleep(MOCKUP_POLL_INTERVAL_MS);

      const response = await fetch(`/api/image-jobs/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as QueuedMockupJobResponse;

      if (!response.ok || !data.job) {
        throw new Error(data.error ?? t("读取套图任务进度失败", "Failed to read mockup job progress"));
      }

      const result = buildMockupResultFromQueuedJob(data.job, assetById);
      const doneCount = result.success_count + result.failed_count;
      const percent =
        result.total_count > 0 ? Math.min(100, Math.round((doneCount / result.total_count) * 100)) : 0;

      setJobResult(result);
      setMessage(
        TERMINAL_MOCKUP_STATUSES.has(result.status)
          ? t(`套图任务已完成：${doneCount}/${result.total_count}`, `Mockup job finished: ${doneCount}/${result.total_count}`)
          : t(`后台处理中：${doneCount}/${result.total_count}，${percent}%`, `Processing in worker: ${doneCount}/${result.total_count}, ${percent}%`),
      );

      if (TERMINAL_MOCKUP_STATUSES.has(result.status)) {
        return result;
      }
    }

    return null;
  }

  async function generateMockups() {
    const assetIds = Array.from(selectedAssetIds);

    if (assetIds.length === 0) {
      setError(t("请选择至少一张素材图片", "Please select at least one asset image"));
      return;
    }

    if (!templateId) {
      setError(t("请选择一个套图模板", "Please select a mockup template"));
      return;
    }

    setIsGenerating(true);
    setError(null);
    setMessage(null);
    setJobResult(null);
    setDownloadResults({});

    try {
      const data = await createMockupJob({ asset_ids: assetIds, template_id: templateId });
      if (data.error || !data.job) {
        throw new Error(data.error ?? t("套图任务创建失败", "Failed to create mockup job"));
      }

      const assetById = new Map(assets.map((asset) => [asset.id, asset]));
      setJobResult(data.job);
      setMessage(t(`已提交后台任务：${data.job.total_count} 张素材`, `Queued worker job: ${data.job.total_count} assets`));

      const finalResult = await waitForMockupJob(data.job.id, assetById);
      if (!finalResult) {
        setMessage(t("套图任务仍在后台处理，可稍后到图片任务页查看结果。", "Mockup job is still running. Check Image Jobs later."));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("套图生成失败", "Mockup generation failed"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadMockupOutput(output: MockupJobOutput) {
    if (!output.mockup_output_id || output.output_images.length === 0) {
      setError(t("该套图没有图片，无法下载", "This mockup has no images to download"));
      return;
    }

    setDownloadingOutputId(output.mockup_output_id);
    setError(null);

    try {
      const response = await fetch(
        `/api/mockup-outputs/${encodeURIComponent(output.mockup_output_id)}/images-zip`,
        { method: "POST" },
      );
      const data = (await response.json()) as MockupOutputZipResponse;

      if (!response.ok || !data.download_url) {
        throw new Error(data.error ?? t("下载套图 ZIP 失败", "Failed to download mockup ZIP"));
      }

      setDownloadResults((current) => ({
        ...current,
        [output.mockup_output_id as string]: data,
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? t("网络请求失败，请将 localhost 加入代理排除列表后重试", "Network request failed. Add localhost to your proxy bypass list and try again.") : requestError.message) : t("下载套图 ZIP 失败", "Failed to download mockup ZIP"));
    } finally {
      setDownloadingOutputId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label htmlFor="mockup-template" className="block text-sm font-medium text-zinc-950">
              {t("套图模板", "Mockup Template")}
            </label>
            <select
              id="mockup-template"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {templates.length === 0 ? <option value="">{t("暂无模板", "No templates")}</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} / {template.product_type}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">
            {selectedTemplate ? (
              <>
                <p className="font-medium text-zinc-950">{selectedTemplate.name}</p>
                <p className="mt-1">
                  {selectedTemplate.product_type} · {t(`${selectedTemplate.scenes.length} 个场景`, `${selectedTemplate.scenes.length} scenes`)}
                </p>
              </>
            ) : (
              <p>{t("请先创建套图模板。", "Create a mockup template first.")}</p>
            )}
          </div>

          <button
            type="button"
            onClick={toggleAllAssets}
            disabled={assets.length === 0 || isGenerating}
            className="self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {assets.length > 0 && assets.every((asset) => selectedAssetIds.has(asset.id))
              ? t("取消全选", "Deselect All")
              : t("全选素材", "Select All Assets")}
          </button>

          <button
            type="button"
            onClick={() => void generateMockups()}
            disabled={isGenerating || selectedAssetIds.size === 0 || !templateId}
            className="self-end rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isGenerating ? t("生成中...", "Generating...") : t("生成套图", "Generate Mockups")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>{t(`可用素材 ${assets.length} 张`, `${assets.length} available assets`)}</span>
          <span>{t(`已选择 ${selectedAssetIds.size} 张`, `${selectedAssetIds.size} selected`)}</span>
          {selectedAssets.length > 0 ? (
            <span className="text-zinc-500">
              {t("最近选择：", "Recent selection: ")}{selectedAssets.slice(0, 3).map((asset) => asset.filename).join(t("、", ", "))}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-800">
            {message}
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-950">{t("选择素材图片", "Select Asset Images")}</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {t("优先使用处理后图片，没有处理图时使用原图。", "Uses processed images first, falling back to originals.")}
          </p>
        </div>

        {assets.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">{t("暂无素材，请先上传图片。", "No assets yet. Upload images first.")}</div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {pagedAssets.map((asset) => {
              const isSelected = selectedAssetIds.has(asset.id);
              const previewUrl = pickAssetPreviewUrl(asset);

              return (
                <article
                  key={asset.id}
                  className={[
                    "overflow-hidden rounded-md border bg-white transition",
                    isSelected ? "border-emerald-700 ring-2 ring-emerald-700/10" : "border-zinc-200",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => toggleAsset(asset.id)}
                    className="relative block aspect-square w-full overflow-hidden bg-zinc-100"
                    aria-label={t(`选择 ${asset.filename}`, `Select ${asset.filename}`)}
                  >
                    <Image
                      src={getDisplayImageSrc(previewUrl)}
                      alt={asset.filename}
                      fill
                      sizes="(min-width: 1280px) 20vw, (min-width: 640px) 33vw, 50vw"
                      className="object-cover"
                    />
                  </button>
                  <div className="space-y-2 p-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleAsset(asset.id)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span className="min-w-0 truncate">{asset.filename}</span>
                    </label>
                    <p className="text-xs text-zinc-500">
                      {previewUrl === asset.original_url ? t("使用原图", "Using original image") : t("使用优先图", "Using preferred image")}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {assets.length > 0 ? (
          <div className="px-5 pb-5">
            <Pagination
              page={currentAssetsPage}
              totalPages={assetsTotalPages}
              total={assets.length}
              unitZh="张"
              unitEn="assets"
              onChange={setAssetsPage}
            />
          </div>
        ) : null}
      </section>

      {jobResult ? (
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">{t("套图生成结果", "Mockup Generation Results")}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {t("任务", "Job")} {shortId(jobResult.id)} · {t(jobStatusLabels[jobResult.status].zh, jobStatusLabels[jobResult.status].en)}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm text-zinc-600">
              <span>{t("总数", "Total")} {jobResult.total_count}</span>
              <span>{t("成功", "Success")} {jobResult.success_count}</span>
              <span>{t("失败", "Failed")} {jobResult.failed_count}</span>
            </div>
          </div>
          <div className="border-b border-zinc-200 px-5 py-4">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{t("后台进度", "Worker progress")}</span>
              <span>
                {jobDoneCount}/{jobResult.total_count} · {jobProgress}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${jobProgress}%` }}
              />
            </div>
          </div>

          <div className="divide-y divide-zinc-200">
            {jobResult.outputs.map((output) => {
              const downloadResult = output.mockup_output_id
                ? downloadResults[output.mockup_output_id]
                : null;
              const isDownloading = downloadingOutputId === output.mockup_output_id;
              const canDownload =
                output.status === "completed" &&
                !!output.mockup_output_id &&
                output.output_images.length > 0;

              return (
                <div key={`${output.asset_id}-${output.item_id}`} className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">{output.filename}</p>
                      <p className="mt-1 font-mono text-xs text-zinc-500">
                        {output.mockup_output_id
                          ? `mockup_outputs: ${shortId(output.mockup_output_id)}`
                          : t("未生成 mockup_outputs", "No mockup_outputs generated")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadMockupOutput(output)}
                        disabled={downloadingOutputId !== null || !canDownload}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                      >
                        {isDownloading ? t("打包中...", "Packing...") : t("下载套图 ZIP", "Download Mockup ZIP")}
                      </button>
                      <span
                        className={[
                          "rounded-md px-2.5 py-1 text-xs font-medium",
                          outputStatusClass(output.status),
                        ].join(" ")}
                      >
                        {t(outputStatusLabels[output.status].zh, outputStatusLabels[output.status].en)}
                      </span>
                    </div>
                  </div>

                  {output.error_message ? (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {output.error_message}
                    </div>
                  ) : null}

                  {downloadResult?.download_url ? (
                    <a
                      href={downloadResult.download_url}
                      download
                      className="block rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {t(`下载文件：${downloadResult.filename}`, `Download file: ${downloadResult.filename}`)}
                    </a>
                  ) : null}

                  {output.output_images.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {output.output_images.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-md border border-zinc-200 bg-white"
                        >
                          <span className="relative block aspect-square overflow-hidden bg-zinc-100">
                            <Image
                              src={getDisplayImageSrc(url)}
                              alt={t(`商品图 ${index + 1}`, `Product Image ${index + 1}`)}
                              fill
                              sizes="(min-width: 1280px) 20vw, 50vw"
                              className="object-contain"
                            />
                          </span>
                          <span className="block border-t border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-800">
                            {t(`商品图 ${index + 1}`, `Product Image ${index + 1}`)}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
