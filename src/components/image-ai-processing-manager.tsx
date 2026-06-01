"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchAssetsForProcessing } from "@/lib/actions/common";

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
  ok?: boolean;
  results?: ApiResultItem[];
  success?: number;
  total?: number;
};

type ImageAiProcessingManagerProps = {
  initialError?: string | null;
  kind: ProcessingKind;
};

const cutoutModes = [
  { label: "自动背景移除", value: "auto_background" },
  { label: "去白底", value: "white_background" },
  { label: "去黑底", value: "black_background" },
  { label: "去纯色背景", value: "solid_background" },
  { label: "边缘泛洪移除", value: "edge_flood_fill" },
];

const printModes = [
  { label: "自动模式", value: "auto" },
  { label: "浅色衣服提取", value: "light_garment" },
  { label: "深色衣服提取", value: "dark_garment" },
  { label: "高对比图案", value: "high_contrast" },
];

function getPreviewUrl(asset: Asset): string {
  return asset.preferred_design_url ?? asset.print_extract_url ?? asset.cutout_url ?? asset.processed_url ?? asset.original_url;
}

function getExistingResultUrl(asset: Asset, kind: ProcessingKind): string | null {
  return kind === "cutout" ? asset.cutout_url : asset.print_extract_url;
}

function getResultLabel(kind: ProcessingKind): string {
  return kind === "cutout" ? "抠图结果" : "印花提取结果";
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
  const selectedCount = selectedIds.size;
  const resultLabel = getResultLabel(kind);
  const modeOptions = kind === "cutout" ? cutoutModes : printModes;
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds],
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
      setError(requestError instanceof Error ? requestError.message : "读取素材列表失败");
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

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
      setError("请先选择至少一张素材");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setMessage(kind === "cutout" ? "正在执行抠图..." : "正在提取印花图...");
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
        throw new Error(data.error ?? "处理失败");
      }

      const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
      const nextSummary = buildSummaryFromResponse(data, kind, assetMap);
      setSummary(nextSummary);
      setMessage(`处理完成：成功 ${nextSummary.success} 张，失败 ${nextSummary.failed} 张`);
      await refreshAssets();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "处理失败");
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
                <h3 className="text-base font-semibold text-zinc-950">选择素材</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  共 {assets.length} 张素材，已选择 {selectedCount} 张
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
                    ? "取消全选"
                    : "全选"}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshAssets()}
                  disabled={isLoadingAssets || isProcessing}
                  className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {isLoadingAssets ? "刷新中..." : "刷新素材"}
                </button>
              </div>
            </div>

            {assets.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
                暂无素材，请先到上传页面上传图片。
              </div>
            ) : (
              <div className="mt-4 grid max-h-[620px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
                {assets.map((asset) => {
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
                      <span
                        className="block aspect-square rounded-md bg-zinc-100 bg-cover bg-center"
                        style={{ backgroundImage: `url("${getPreviewUrl(asset)}")` }}
                      />
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
                            {existingResultUrl ? `已有${resultLabel}` : `暂无${resultLabel}`}
                          </span>
                          <span
                            className={[
                              "rounded-md px-2 py-1",
                              asset.preferred_design_url ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-500",
                            ].join(" ")}
                          >
                            {asset.preferred_design_url ? "已有优先图" : "暂无优先图"}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-md bg-zinc-50 p-4">
            <h3 className="text-base font-semibold text-zinc-950">处理参数</h3>
            <div className="mt-4 space-y-4">
              <label htmlFor="image-ai-mode" className="block text-sm font-medium text-zinc-950">
                处理模式
                <select
                  id="image-ai-mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  disabled={isProcessing}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {modeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {kind === "cutout" ? (
                <>
                  <label className="block text-sm font-medium text-zinc-950">
                    背景容差
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
                    裁剪到主体边界
                  </label>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-zinc-950">
                    边距 padding
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
                    最小连通区域
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
                处理成功后设为套图优先图
              </label>

              <button
                type="button"
                onClick={() => void startProcessing()}
                disabled={selectedCount === 0 || isProcessing}
                className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isProcessing ? "处理中..." : kind === "cutout" ? "开始抠图" : "开始提取"}
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
            <h3 className="text-base font-semibold text-zinc-950">处理结果</h3>
            <p className="mt-1 text-sm text-zinc-500">
              总数 {summary.total}，成功 {summary.success}，失败 {summary.failed}
            </p>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {summary.results.map((item) => (
              <article key={item.item_id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-zinc-950">{item.filename}</h4>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.status === "completed" ? "处理成功" : "处理失败"}
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
                    {item.status === "completed" ? "成功" : "失败"}
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
                      aria-label="打开预览图"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      无预览图
                    </div>
                  )}
                  {item.output_url ? (
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square rounded-md border border-zinc-200 bg-zinc-100 bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${item.output_url}")` }}
                      aria-label={kind === "cutout" ? "打开结果图" : "打开最终图"}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
                      无结果图
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
                        打开预览图
                      </a>
                    ) : null}
                    <a
                      href={item.output_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
                    >
                      {kind === "cutout" ? "打开结果图" : "打开最终图"}
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
          已选择：{selectedAssets.slice(0, 5).map((asset) => asset.filename).join("、")}
          {selectedAssets.length > 5 ? ` 等 ${selectedAssets.length} 张` : ""}
        </div>
      ) : null}
    </div>
  );
}
