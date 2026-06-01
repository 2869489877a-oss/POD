"use client";

import { useMemo, useState } from "react";

import { fetchMockupJobs, createMockupJob } from "@/lib/actions/mockup-jobs";

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

const jobStatusLabels: Record<MockupJobResult["status"], string> = {
  completed: "已完成",
  failed: "失败",
  partial_failed: "部分失败",
};

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-6)}` : id;
}

export function MockupJobsManager({
  assets,
  initialError = null,
  templates,
}: MockupJobsManagerProps) {
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
      setError("请选择至少一张素材图片");
      return;
    }

    if (!templateId) {
      setError("请选择一个套图模板");
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
      setError(requestError instanceof Error ? requestError.message : "套图生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadMockupOutput(output: MockupJobOutput) {
    if (!output.mockup_output_id || output.output_images.length === 0) {
      setError("该套图没有图片，无法下载");
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
        throw new Error(data.error ?? "下载套图 ZIP 失败");
      }

      setDownloadResults((current) => ({
        ...current,
        [output.mockup_output_id as string]: data,
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? "网络请求失败，请将 localhost 加入代理排除列表后重试" : requestError.message) : "下载套图 ZIP 失败");
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
              套图模板
            </label>
            <select
              id="mockup-template"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {templates.length === 0 ? <option value="">暂无模板</option> : null}
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
                  {selectedTemplate.product_type} · {selectedTemplate.scenes.length} 个场景
                </p>
              </>
            ) : (
              <p>请先创建套图模板。</p>
            )}
          </div>

          <button
            type="button"
            onClick={toggleAllAssets}
            disabled={assets.length === 0 || isGenerating}
            className="self-end rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {assets.length > 0 && assets.every((asset) => selectedAssetIds.has(asset.id))
              ? "取消全选"
              : "全选素材"}
          </button>

          <button
            type="button"
            onClick={() => void generateMockups()}
            disabled={isGenerating || selectedAssetIds.size === 0 || !templateId}
            className="self-end rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isGenerating ? "生成中..." : "生成套图"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
          <span>可用素材 {assets.length} 张</span>
          <span>已选择 {selectedAssetIds.size} 张</span>
          {selectedAssets.length > 0 ? (
            <span className="text-zinc-500">
              最近选择：{selectedAssets.slice(0, 3).map((asset) => asset.filename).join("、")}
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
          <h3 className="text-base font-semibold text-zinc-950">选择素材图片</h3>
          <p className="mt-1 text-sm text-zinc-500">
            优先使用处理后图片，没有处理图时使用原图。
          </p>
        </div>

        {assets.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">暂无素材，请先上传图片。</div>
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
                    aria-label={`选择 ${asset.filename}`}
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
                      {asset.processed_url ? "使用处理后图片" : "使用原图"}
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
              <h3 className="text-base font-semibold text-zinc-950">套图生成结果</h3>
              <p className="mt-1 text-sm text-zinc-500">
                任务 {shortId(jobResult.id)} · {jobStatusLabels[jobResult.status]}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm text-zinc-600">
              <span>总数 {jobResult.total_count}</span>
              <span>成功 {jobResult.success_count}</span>
              <span>失败 {jobResult.failed_count}</span>
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
                          : "未生成 mockup_outputs"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadMockupOutput(output)}
                        disabled={downloadingOutputId !== null}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                      >
                        {isDownloading ? "打包中..." : "下载套图 ZIP"}
                      </button>
                      <span
                        className={[
                          "rounded-md px-2.5 py-1 text-xs font-medium",
                          output.status === "completed"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700",
                        ].join(" ")}
                      >
                        {output.status === "completed" ? "生成成功" : "生成失败"}
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
                      下载文件：{downloadResult.filename}
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
                            商品图 {index + 1}
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
