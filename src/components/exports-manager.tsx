"use client";

import { useMemo, useState } from "react";

import type {
  ProductDraftStatus,
  ProductDraftView,
} from "@/lib/products/types";
import type { ExportRecordView } from "@/lib/exports/records";

type ExportsManagerProps = {
  exportRecords: ExportRecordView[];
  initialError?: string | null;
  products: ProductDraftView[];
};

type ExportKind = "excel" | "zip";

type ExportResponse = {
  count?: number;
  download_url?: string;
  error?: string;
  filename?: string;
  record?: ExportRecordView;
};

const statusLabels: Record<ProductDraftStatus, string> = {
  draft: "草稿",
  exported: "已导出",
  failed: "失败",
  ready: "待导出",
};

const statusStyles: Record<ProductDraftStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  exported: "bg-sky-50 text-sky-700",
  failed: "bg-red-50 text-red-700",
  ready: "bg-emerald-50 text-emerald-700",
};

const exportTypeLabels: Record<ExportRecordView["export_type"], string> = {
  excel: "Excel",
  images_zip: "图片 ZIP",
};

const exportStatusLabels: Record<ExportRecordView["status"], string> = {
  completed: "成功",
  failed: "失败",
};

const exportStatusStyles: Record<ExportRecordView["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function imageCount(product: ProductDraftView) {
  if (product.images.length > 0) {
    return product.images.length;
  }

  return product.main_image_url ? 1 : 0;
}

export function ExportsManager({
  exportRecords,
  initialError = null,
  products,
}: ExportsManagerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyKind, setBusyKind] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [excelResult, setExcelResult] = useState<ExportResponse | null>(null);
  const [zipResult, setZipResult] = useState<ExportResponse | null>(null);
  const [records, setRecords] = useState<ExportRecordView[]>(exportRecords);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.includes(product.id)),
    [products, selectedIds],
  );
  const allSelected = products.length > 0 && selectedIds.length === products.length;

  function toggleProduct(productId: string) {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
    setError(null);
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : products.map((product) => product.id));
    setError(null);
  }

  async function exportSelected(kind: ExportKind) {
    if (selectedIds.length === 0) {
      setError("请选择至少一个商品草稿");
      return;
    }

    setBusyKind(kind);
    setError(null);

    try {
      const response = await fetch(
        kind === "excel" ? "/api/exports/excel" : "/api/exports/images-zip",
        {
          body: JSON.stringify({ product_ids: selectedIds }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const data = (await response.json()) as ExportResponse;

      if (!response.ok) {
        throw new Error(data.error ?? (kind === "excel" ? "导出 Excel 失败" : "导出图片 ZIP 失败"));
      }

      if (kind === "excel") {
        setExcelResult(data);
      } else {
        setZipResult(data);
      }

      if (data.record) {
        setRecords((current) => [data.record as ExportRecordView, ...current].slice(0, 30));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? "网络请求失败，请将 localhost 加入代理排除列表后重试" : requestError.message) : "导出失败");
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">选择导出商品</h3>
            <p className="mt-1 text-sm text-zinc-500">
              当前只显示 status 为 draft 或 ready 的商品草稿。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleAll}
              disabled={products.length === 0 || busyKind !== null}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {allSelected ? "取消全选" : "全选"}
            </button>
            <button
              type="button"
              onClick={() => void exportSelected("excel")}
              disabled={selectedIds.length === 0 || busyKind !== null}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {busyKind === "excel" ? "导出中..." : "导出 Excel"}
            </button>
            <button
              type="button"
              onClick={() => void exportSelected("zip")}
              disabled={selectedIds.length === 0 || busyKind !== null}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {busyKind === "zip" ? "打包中..." : "导出图片 ZIP"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            可导出商品：<span className="font-semibold text-zinc-950">{products.length}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            已选择：<span className="font-semibold text-zinc-950">{selectedIds.length}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            图片数：{" "}
            <span className="font-semibold text-zinc-950">
              {selectedProducts.reduce((total, product) => total + imageCount(product), 0)}
            </span>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {excelResult?.download_url || zipResult?.download_url ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {excelResult?.download_url ? (
              <a
                href={excelResult.download_url}
                download
                className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 transition hover:bg-emerald-100"
              >
                下载 Excel：{excelResult.filename}（{excelResult.count ?? 0} 个商品）
              </a>
            ) : null}
            {zipResult?.download_url ? (
              <a
                href={zipResult.download_url}
                download
                className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 transition hover:bg-emerald-100"
              >
                下载图片 ZIP：{zipResult.filename}（{zipResult.count ?? 0} 个商品）
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-950">导出记录</h3>
          <p className="mt-1 text-sm text-zinc-500">最近 30 条导出结果。</p>
        </div>

        {records.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">暂无导出记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">类型</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">商品数</th>
                  <th className="px-5 py-3">文件</th>
                  <th className="px-5 py-3">创建时间</th>
                  <th className="px-5 py-3">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-4 text-zinc-700">
                      {exportTypeLabels[record.export_type]}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={[
                          "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                          exportStatusStyles[record.status],
                        ].join(" ")}
                      >
                        {exportStatusLabels[record.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{record.product_count}</td>
                    <td className="px-5 py-4">
                      {record.download_url ? (
                        <a
                          href={record.download_url}
                          download
                          className="font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          {record.filename ?? "下载文件"}
                        </a>
                      ) : (
                        <span className="text-zinc-400">无文件</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{formatDate(record.created_at)}</td>
                    <td className="max-w-xs truncate px-5 py-4 text-zinc-500">
                      {record.error_message ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-950">商品草稿列表</h3>
          <p className="mt-1 text-sm text-zinc-500">勾选多个商品后导出。</p>
        </div>

        {products.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">暂无可导出的商品草稿。</div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {products.map((product) => {
              const checked = selectedIds.includes(product.id);

              return (
                <label
                  key={product.id}
                  className={[
                    "grid cursor-pointer gap-4 px-5 py-4 transition hover:bg-zinc-50 md:grid-cols-[24px_88px_1fr_auto]",
                    checked ? "bg-emerald-50/70" : "",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProduct(product.id)}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-700"
                  />
                  {product.main_image_url ? (
                    <span
                      className="block aspect-square rounded-md bg-zinc-100 bg-cover bg-center"
                      style={{ backgroundImage: `url("${product.main_image_url}")` }}
                    />
                  ) : (
                    <span className="flex aspect-square items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400">
                      无图片
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-950">
                      {product.title || "未填写标题"}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      SKU：{product.sku || "-"} · 类型：{product.product_type || "-"} · 价格：
                      {formatPrice(product.price)}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      图片：{imageCount(product)} 张 · 创建时间：{formatDate(product.created_at)}
                    </span>
                  </span>
                  <span className="self-start">
                    <span
                      className={[
                        "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                        statusStyles[product.status],
                      ].join(" ")}
                    >
                      {statusLabels[product.status]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
