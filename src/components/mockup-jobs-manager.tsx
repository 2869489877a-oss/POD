"use client";

import { useMemo, useState } from "react";

import { fetchMockupJobs, createMockupJob } from "@/lib/actions/mockup-jobs";
import { useSettings } from "@/lib/settings/context";

import type { MockupScene } from "@/lib/mockups/scenes";

export type MockupJobAsset = {
  filename: string;
  id: string;
  original_url: string;
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

type MockupJobOutput = {
  asset_id: string;
  error_message: string | null;
  filename: string;
  item_id: string;
  mockup_output_id: string | null;
  output_images: string[];
  status: "completed" | "failed";
};

type MockupJobResult = {
  failed_count: number;
  id: string;
  outputs: MockupJobOutput[];
  status: "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
};

type MockupJobResponse = {
  error?: string;
  job?: MockupJobResult;
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

const jobStatusLabels: Record<MockupJobResult["status"], { zh: string; en: string }> = {
  completed: { zh: "已完成", en: "Completed" },
  failed: { zh: "失败", en: "Failed" },
  partial_failed: { zh: "部分失败", en: "Partial Failed" },
};

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
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
  const [downloadingOutputId, setDownloadingOutputId] = useState<string | null>(null);
  const [downloadResults, setDownloadResults] = useState<Record<string, MockupOutputZipResponse>>({});

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  );
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIds.has(asset.id)),
    [assets, selectedAssetIds],
  );

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
    setJobResult(null);
    setDownloadResults({});

    try {
      const data = await createMockupJob({ asset_ids: assetIds, template_id: templateId });
      if (data.error) throw new Error(data.error);

      setJobResult({ count: data.count } as unknown as MockupJobResult);
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
            {assets.map((asset) => {
              const isSelected = selectedAssetIds.has(asset.id);
              const previewUrl = asset.processed_url ?? asset.original_url;

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
                    className="block aspect-square w-full bg-zinc-100 bg-cover bg-center"
                    style={{ backgroundImage: `url("${previewUrl}")` }}
                    aria-label={t(`选择 ${asset.filename}`, `Select ${asset.filename}`)}
                  />
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
                      {asset.processed_url ? t("使用处理后图片", "Using processed image") : t("使用原图", "Using original image")}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
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

          <div className="divide-y divide-zinc-200">
            {jobResult.outputs.map((output) => {
              const downloadResult = output.mockup_output_id
                ? downloadResults[output.mockup_output_id]
                : null;
              const isDownloading = downloadingOutputId === output.mockup_output_id;

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
                        disabled={downloadingOutputId !== null}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                      >
                        {isDownloading ? t("打包中...", "Packing...") : t("下载套图 ZIP", "Download Mockup ZIP")}
                      </button>
                      <span
                        className={[
                          "rounded-md px-2.5 py-1 text-xs font-medium",
                          output.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700",
                        ].join(" ")}
                      >
                        {output.status === "completed" ? t("生成成功", "Generated") : t("生成失败", "Failed")}
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
                          <span
                            className="block aspect-square bg-zinc-100 bg-contain bg-center bg-no-repeat"
                            style={{ backgroundImage: `url("${url}")` }}
                          />
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
