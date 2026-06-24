"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { fetchAssetsForProcessing } from "@/lib/actions/common";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";
import { getDisplayImageSrc } from "@/lib/local-asset-url";

const ASSETS_PER_PAGE = 10;

type ProcessingKind = "cutout" | "print_extraction";

type Asset = {
  cutout_url: string | null;
  filename: string;
  format: string;
  height: number;
  id: string;
  original_url: string;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
  status: "uploaded" | "processing" | "processed" | "failed";
  width: number;
};

type ApiResultItem = {
  asset_id: string;
  cutout_url?: string;
  derivative_id?: string | null;
  error_message?: string;
  filename?: string | null;
  final_url?: string;
  input_url?: string;
  mask_url?: string;
  metrics?: Record<string, unknown>;
  preview_url?: string;
  raw_url?: string;
  status: "completed" | "failed";
};

type ProcessingResultItem = {
  asset_id: string;
  error_message: string | null;
  filename: string;
  input_url: string;
  item_id: string;
  output_url: string | null;
  preview_url: string | null;
  status: "completed" | "failed";
};

type ProcessingSummary = {
  failed: number;
  results: ProcessingResultItem[];
  success: number;
  total: number;
};

type ProcessingResponse = {
  error?: string;
  failed?: number;
  job_id?: string;
  ok?: boolean;
  queued?: boolean;
  results?: ApiResultItem[];
  success?: number;
  total?: number;
};

type ImageAiProcessingManagerProps = {
  initialError?: string | null;
  kind: ProcessingKind;
};

const cutoutModes = [
  { zh: "自动背景移除", en: "Auto Background Removal", value: "auto_background" },
  { zh: "去白底", en: "Remove White Background", value: "white_background" },
  { zh: "去黑底", en: "Remove Black Background", value: "black_background" },
  { zh: "去纯色背景", en: "Remove Solid Background", value: "solid_background" },
  { zh: "边缘泛洪移除", en: "Edge Flood Fill", value: "edge_flood_fill" },
];

const printModes = [
  { zh: "自动模式", en: "Auto Mode", value: "auto" },
  { zh: "浅色衣服提取", en: "Light Garment Extraction", value: "light_garment" },
  { zh: "深色衣服提取", en: "Dark Garment Extraction", value: "dark_garment" },
  { zh: "高对比图案", en: "High Contrast Artwork", value: "high_contrast" },
];

function getPreviewUrl(asset: Asset): string {
  return asset.preferred_design_url ?? asset.print_extract_url ?? asset.cutout_url ?? asset.processed_url ?? asset.original_url;
}

function getExistingResultUrl(asset: Asset, kind: ProcessingKind): string | null {
  return kind === "cutout" ? asset.cutout_url : asset.print_extract_url;
}

function buildSummaryFromResponse(
  data: ProcessingResponse,
  kind: ProcessingKind,
  assetMap: Map<string, Asset>,
): ProcessingSummary {
  const results = data.results ?? [];
  const items = results.map((result, index): ProcessingResultItem => {
    const asset = assetMap.get(result.asset_id);
    const outputUrl = kind === "cutout" ? result.cutout_url ?? null : result.final_url ?? null;

    return {
      asset_id: result.asset_id,
      error_message: result.error_message ?? null,
      filename: result.filename ?? asset?.filename ?? result.asset_id,
      input_url: result.input_url ?? asset?.original_url ?? "",
      item_id: `${result.asset_id}-${index}`,
      output_url: outputUrl,
      preview_url: result.preview_url ?? null,
      status: result.status,
    };
  });

  return {
    failed: data.failed ?? items.filter((item) => item.status === "failed").length,
    results: items,
    success: data.success ?? items.filter((item) => item.status === "completed").length,
    total: data.total ?? items.length,
  };
}

export function ImageAiProcessingManager({ initialError = null, kind }: ImageAiProcessingManagerProps) {
  const { t } = useSettings();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState(kind === "cutout" ? "auto_background" : "auto");
  const [tolerance, setTolerance] = useState(35);
  const [padding, setPadding] = useState(40);
  const [minComponentArea, setMinComponentArea] = useState(80);
  const [cropToContent, setCropToContent] = useState(true);
  const [setPreferred, setSetPreferred] = useState(true);
  const [summary, setSummary] = useState<ProcessingSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [page, setPage] = useState(1);
  const selectedCount = selectedIds.size;
  const resultLabel = kind === "cutout" ? t("抠图结果", "cutout result") : t("印花提取结果", "print extraction result");
  const modeOptions = kind === "cutout" ? cutoutModes : printModes;
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds],
  );
  const assetsTotalPages = Math.max(1, Math.ceil(assets.length / ASSETS_PER_PAGE));
  const currentPage = Math.min(page, assetsTotalPages);
  const pagedAssets = useMemo(
    () => assets.slice((currentPage - 1) * ASSETS_PER_PAGE, currentPage * ASSETS_PER_PAGE),
    [assets, currentPage],
  );

  const refreshAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    setError(null);

    try {
      const data = await fetchAssetsForProcessing();
      if (data.error) throw new Error(data.error);

      const nextAssets = (data.assets ?? []) as Asset[];
      setAssets(nextAssets);
      setSelectedIds((current) => {
        const visibleIds = new Set(nextAssets.map((asset) => asset.id));
        return new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取素材列表失败", "Failed to load asset list"));
    } finally {
      setIsLoadingAssets(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAssets();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshAssets]);

  function toggleAsset(assetId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }

      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (assets.length > 0 && assets.every((asset) => current.has(asset.id))) {
        return new Set();
      }

      return new Set(assets.map((asset) => asset.id));
    });
  }

  async function startProcessing() {
    const assetIds = Array.from(selectedIds);

    if (assetIds.length === 0) {
      setError(t("请先选择至少一张素材", "Please select at least one asset first"));
      return;
    }

    setIsProcessing(true);
    setError(null);
    setMessage(kind === "cutout" ? t("正在执行抠图...", "Running cutout...") : t("正在提取印花图...", "Extracting print artwork..."));
    setSummary(null);

    try {
      const endpoint = kind === "cutout" ? "/api/cutout/jobs" : "/api/print-extraction/jobs";
      const body =
        kind === "cutout"
          ? {
              assetIds,
              mode,
              options: {
                cropToContent,
                featherRadius: 1,
                maxSize: 1800,
                padding: 20,
                tolerance,
              },
              setPreferred,
            }
          : {
              assetIds,
              mode,
              options: {
                featherRadius: 1,
                maxSize: 1800,
                minComponentArea,
                padding,
                preserveBlackInk: true,
                preserveWhiteInk: true,
              },
              setPreferred,
            };

      const response = await fetch(endpoint, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as ProcessingResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? t("处理失败", "Processing failed"));
      }

      if (data.queued) {
        setSummary(null);
        setMessage(
          t(
            `已提交到后台 worker：共 ${data.total ?? assetIds.length} 张，正在自动处理。任务 ID：${data.job_id ?? "未知"}，稍后刷新即可查看结果。`,
            `Submitted to the background worker: ${data.total ?? assetIds.length} image(s). Job ID: ${data.job_id ?? "unknown"}. Refresh shortly to see results.`
          ),
        );
        setMessage(
          t(
            `已提交到后台 worker：共 ${data.total ?? assetIds.length} 张，正在自动处理。任务 ID：${data.job_id ?? "未知"}，稍后刷新即可查看结果。`,
            `Submitted to the background worker: ${data.total ?? assetIds.length} image(s). Job ID: ${data.job_id ?? "unknown"}. Refresh shortly to see results.`
          ),
        );
        await refreshAssets();
        return;
      }

      const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
      const nextSummary = buildSummaryFromResponse(data, kind, assetMap);
      setSummary(nextSummary);
      setMessage(t(`处理完成：成功 ${nextSummary.success} 张，失败 ${nextSummary.failed} 张`, `Processing complete: ${nextSummary.success} succeeded, ${nextSummary.failed} failed`));
      await refreshAssets();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("处理失败", "Processing failed"));
      setMessage(null);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-950">{t("选择素材", "Select Assets")}</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {t(`共 ${assets.length} 张素材，已选择 ${selectedCount} 张`, `${assets.length} assets, ${selectedCount} selected`)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  disabled={assets.length === 0 || isProcessing}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                >
                  {assets.length > 0 && assets.every((asset) => selectedIds.has(asset.id))
                    ? t("取消全选", "Deselect All")
                    : t("全选", "Select All")}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshAssets()}
                  disabled={isLoadingAssets || isProcessing}
                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isLoadingAssets ? t("刷新中...", "Refreshing...") : t("刷新素材", "Refresh Assets")}
                </button>
              </div>
            </div>

            {assets.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                {t("暂无素材，请先到上传页面上传图片。", "No assets yet. Upload images on the Upload page first.")}
              </div>
            ) : (
              <div className="mt-4 grid max-h-[620px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {pagedAssets.map((asset) => {
                  const isSelected = selectedIds.has(asset.id);
                  const existingResultUrl = getExistingResultUrl(asset, kind);

                  return (
                    <label
                      key={asset.id}
                      className={[
                        "grid cursor-pointer grid-cols-[92px_1fr] gap-3 rounded-md border p-3 transition",
                        isSelected ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      <span className="relative block aspect-square overflow-hidden rounded-md bg-zinc-100">
                        <Image
                          src={getDisplayImageSrc(getPreviewUrl(asset))}
                          alt={asset.filename}
                          fill
                          sizes="92px"
                          className="object-cover"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAsset(asset.id)}
                            disabled={isProcessing}
                            className="mt-1 h-4 w-4 rounded border-zinc-300"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-zinc-950">
                              {asset.filename}
                            </span>
                            <span className="mt-1 block text-xs text-zinc-500">
                              {asset.width} x {asset.height} · {asset.format.toUpperCase()}
                            </span>
                          </span>
                        </span>
                        <span className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span
                            className={[
                              "rounded-md px-2 py-1",
                              existingResultUrl ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                            ].join(" ")}
                          >
                            {existingResultUrl ? t(`已有${resultLabel}`, `Has ${resultLabel}`) : t(`暂无${resultLabel}`, `No ${resultLabel}`)}
                          </span>
                          <span
                            className={[
                              "rounded-md px-2 py-1",
                              asset.preferred_design_url ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-500",
                            ].join(" ")}
                          >
                            {asset.preferred_design_url ? t("已有优先图", "Has preferred image") : t("暂无优先图", "No preferred image")}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {assets.length > 0 ? (
              <Pagination
                page={currentPage}
                totalPages={assetsTotalPages}
                total={assets.length}
                unitZh="张"
                unitEn="assets"
                onChange={setPage}
              />
            ) : null}
          </div>

          <aside className="rounded-md bg-zinc-50 p-4">
            <h3 className="text-base font-semibold text-zinc-950">{t("处理参数", "Processing Settings")}</h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="image-ai-mode" className="block text-sm font-medium text-zinc-950">
                {t("处理模式", "Processing Mode")}
                <select
                  id="image-ai-mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  disabled={isProcessing}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {modeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.zh, option.en)}
                    </option>
                  ))}
                </select>
              </label>

              {kind === "cutout" ? (
                <>
                  <label className="block text-sm font-medium text-zinc-950">
                    {t("背景容差", "Background Tolerance")}
                    <input
                      type="number"
                      value={tolerance}
                      onChange={(event) => setTolerance(Number(event.target.value))}
                      min={8}
                      max={120}
                      disabled={isProcessing}
                      className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
                    <input
                      type="checkbox"
                      checked={cropToContent}
                      onChange={(event) => setCropToContent(event.target.checked)}
                      disabled={isProcessing}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {t("裁剪到主体边界", "Crop to subject bounds")}
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-zinc-950">
                    {t("边距 padding", "Padding")}
                    <input
                      type="number"
                      value={padding}
                      onChange={(event) => setPadding(Number(event.target.value))}
                      min={0}
                      max={120}
                      disabled={isProcessing}
                      className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block text-sm font-medium text-zinc-950">
                    {t("最小连通区域", "Minimum connected area")}
                    <input
                      type="number"
                      value={minComponentArea}
                      onChange={(event) => setMinComponentArea(Number(event.target.value))}
                      min={1}
                      max={5000}
                      disabled={isProcessing}
                      className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </label>
                </>
              )}

              <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-800">
                <input
                  type="checkbox"
                  checked={setPreferred}
                  onChange={(event) => setSetPreferred(event.target.checked)}
                  disabled={isProcessing}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {t("处理成功后设为套图优先图", "Set successful result as mockup preferred image")}
              </label>

              <button
                type="button"
                onClick={() => void startProcessing()}
                disabled={selectedCount === 0 || isProcessing}
                className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isProcessing ? t("处理中...", "Processing...") : kind === "cutout" ? t("开始抠图", "Start Cutout") : t("开始提取", "Start Extraction")}
              </button>
            </div>
          </aside>
        </div>
      </section>

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {summary ? (
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h3 className="text-base font-semibold text-zinc-950">{t("处理结果", "Processing Results")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t(`总数 ${summary.total}，成功 ${summary.success}，失败 ${summary.failed}`, `Total ${summary.total}, success ${summary.success}, failed ${summary.failed}`)}
            </p>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {summary.results.map((item) => (
              <article key={item.item_id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-zinc-950">{item.filename}</h4>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.status === "completed" ? t("处理成功", "Processed") : t("处理失败", "Failed")}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      item.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700",
                    ].join(" ")}
                  >
                    {item.status === "completed" ? t("成功", "Success") : t("失败", "Failed")}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {item.preview_url ? (
                    <a
                      href={item.preview_url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-cover bg-center"
                      style={{ backgroundImage: `url("${item.preview_url}")` }}
                      aria-label={t("打开预览图", "Open preview image")}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      {t("无预览图", "No preview")}
                    </div>
                  )}
                  {item.output_url ? (
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${item.output_url}")` }}
                      aria-label={kind === "cutout" ? t("打开结果图", "Open result image") : t("打开最终图", "Open final image")}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      {t("无结果图", "No result image")}
                    </div>
                  )}
                </div>

                {item.error_message ? (
                  <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {item.error_message}
                  </div>
                ) : null}

                {item.output_url ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.preview_url ? (
                      <a
                        href={item.preview_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                      >
                        {t("打开预览图", "Open Preview")}
                      </a>
                    ) : null}
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      {kind === "cutout" ? t("打开结果图", "Open Result") : t("打开最终图", "Open Final")}
                    </a>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {selectedAssets.length > 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
          {t("已选择：", "Selected: ")}{selectedAssets.slice(0, 5).map((asset) => asset.filename).join(t("、", ", "))}
          {selectedAssets.length > 5 ? t(` 等 ${selectedAssets.length} 张`, ` and ${selectedAssets.length} total`) : ""}
        </div>
      ) : null}
    </div>
  );
}
