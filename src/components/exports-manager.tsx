"use client";

import { useMemo, useState } from "react";

import type {
  ProductDraftStatus,
  ProductDraftView,
} from "@/lib/products/types";
import type { ExportRecordView } from "@/lib/exports/records";
import { Pagination } from "@/components/pagination";
import { useSettings } from "@/lib/settings/context";

const PRODUCTS_PER_PAGE = 8;

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

const statusLabels: Record<ProductDraftStatus, { zh: string; en: string }> = {
  draft: { zh: "草稿", en: "Draft" },
  exported: { zh: "已导出", en: "Exported" },
  failed: { zh: "失败", en: "Failed" },
  ready: { zh: "待导出", en: "Ready" },
};

const statusStyles: Record<ProductDraftStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  exported: "bg-sky-50 text-sky-700",
  failed: "bg-red-50 text-red-700",
  ready: "bg-emerald-50 text-emerald-700",
};

const statusFilterOptions: Array<"all" | ProductDraftStatus> = ["all", "ready", "draft", "exported", "failed"];

const exportTypeLabels: Record<ExportRecordView["export_type"], { zh: string; en: string }> = {
  excel: { zh: "Excel", en: "Excel" },
  images_zip: { zh: "图片 ZIP", en: "Image ZIP" },
};

const exportStatusLabels: Record<ExportRecordView["status"], { zh: string; en: string }> = {
  completed: { zh: "成功", en: "Success" },
  failed: { zh: "失败", en: "Failed" },
};

const exportStatusStyles: Record<ExportRecordView["status"], string> = {
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
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
  const { language, t } = useSettings();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyKind, setBusyKind] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [excelResult, setExcelResult] = useState<ExportResponse | null>(null);
  const [zipResult, setZipResult] = useState<ExportResponse | null>(null);
  const [records, setRecords] = useState<ExportRecordView[]>(exportRecords);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductDraftStatus>("all");

  const visibleProducts = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      if (statusFilter !== "all" && product.status !== statusFilter) return false;
      if (!keyword) return true;

      return [
        product.title,
        product.sku,
        product.product_type,
        product.status,
        product.id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [products, searchQuery, statusFilter]);
  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.includes(product.id)),
    [products, selectedIds],
  );
  const allVisibleSelected = visibleProducts.length > 0 && visibleProducts.every((product) => selectedIds.includes(product.id));
  const productsTotalPages = Math.max(1, Math.ceil(visibleProducts.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(page, productsTotalPages);
  const pagedProducts = useMemo(
    () => visibleProducts.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE),
    [visibleProducts, currentPage],
  );
  const currentPageVisibleIds = useMemo(() => pagedProducts.map((product) => product.id), [pagedProducts]);
  const currentPageSelected = currentPageVisibleIds.length > 0 && currentPageVisibleIds.every((id) => selectedIds.includes(id));

  function toggleProduct(productId: string) {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
    setError(null);
  }

  function toggleAll() {
    setSelectedIds(allVisibleSelected ? [] : Array.from(new Set([...selectedIds, ...visibleProducts.map((product) => product.id)])));
    setError(null);
  }

  function toggleCurrentPage() {
    if (currentPageSelected) {
      setSelectedIds((current) => current.filter((id) => !currentPageVisibleIds.includes(id)));
    } else {
      setSelectedIds((current) => Array.from(new Set([...current, ...currentPageVisibleIds])));
    }
    setError(null);
  }

  async function exportSelected(kind: ExportKind) {
    if (selectedIds.length === 0) {
      setError(t("请选择至少一个商品草稿", "Please select at least one product draft"));
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
        throw new Error(data.error ?? (kind === "excel" ? t("导出 Excel 失败", "Excel export failed") : t("导出图片 ZIP 失败", "Image ZIP export failed")));
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
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? t("网络请求失败，请将 localhost 加入代理排除列表后重试", "Network request failed. Add localhost to your proxy bypass list and try again.") : requestError.message) : t("导出失败", "Export failed"));
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{t("选择导出商品", "Select Products to Export")}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t("当前只显示 status 为 draft 或 ready 的商品草稿。", "Only product drafts with status draft or ready are shown.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleAll}
              disabled={visibleProducts.length === 0 || busyKind !== null}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {allVisibleSelected ? t("取消筛选结果", "Deselect Filtered") : t("选择筛选结果", "Select Filtered")}
            </button>
            <button
              type="button"
              onClick={toggleCurrentPage}
              disabled={pagedProducts.length === 0 || busyKind !== null}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {currentPageSelected ? t("取消本页", "Deselect Page") : t("选择本页", "Select Page")}
            </button>
            <button
              type="button"
              onClick={() => void exportSelected("excel")}
              disabled={selectedIds.length === 0 || busyKind !== null}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {busyKind === "excel" ? t("导出中...", "Exporting...") : t("导出 Excel", "Export Excel")}
            </button>
            <button
              type="button"
              onClick={() => void exportSelected("zip")}
              disabled={selectedIds.length === 0 || busyKind !== null}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {busyKind === "zip" ? t("打包中...", "Packing...") : t("导出图片 ZIP", "Export Image ZIP")}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-zinc-600 sm:grid-cols-3">
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("可导出商品：", "Exportable products: ")}
            <span className="font-semibold text-zinc-950">{visibleProducts.length}</span>
            <span className="text-zinc-400"> / {products.length}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("已选择：", "Selected: ")}<span className="font-semibold text-zinc-950">{selectedIds.length}</span>
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            {t("图片数：", "Images: ")}{" "}
            <span className="font-semibold text-zinc-950">
              {selectedProducts.reduce((total, product) => total + imageCount(product), 0)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div>
            <label htmlFor="export-search" className="sr-only">
              {t("搜索商品", "Search products")}
            </label>
            <input
              id="export-search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              placeholder={t("搜索标题、SKU、类型", "Search title, SKU, or type")}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as "all" | ProductDraftStatus);
              setPage(1);
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            aria-label={t("按状态筛选", "Filter by status")}
          >
            {statusFilterOptions.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? t("全部状态", "All Statuses") : t(statusLabels[status].zh, statusLabels[status].en)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setPage(1);
            }}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
          >
            {t("清空筛选", "Clear Filters")}
          </button>
        </div>

        {busyKind ? (
          <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
            <div className="flex items-center justify-between gap-3">
              <span>{busyKind === "excel" ? t("正在生成 Excel 文件", "Generating Excel file") : t("正在打包商品图片 ZIP", "Packing product image ZIP")}</span>
              <span>{selectedIds.length} {t("个商品", "products")}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-600" />
            </div>
          </div>
        ) : null}

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
                {t(`下载 Excel：${excelResult.filename}（${excelResult.count ?? 0} 个商品）`, `Download Excel: ${excelResult.filename} (${excelResult.count ?? 0} products)`)}
              </a>
            ) : null}
            {zipResult?.download_url ? (
              <a
                href={zipResult.download_url}
                download
                className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 transition hover:bg-emerald-100"
              >
                {t(`下载图片 ZIP：${zipResult.filename}（${zipResult.count ?? 0} 个商品）`, `Download image ZIP: ${zipResult.filename} (${zipResult.count ?? 0} products)`)}
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-950">{t("导出记录", "Export Records")}</h3>
          <p className="mt-1 text-sm text-zinc-500">{t("最近 30 条导出结果。", "Latest 30 export results.")}</p>
        </div>

        {records.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">{t("暂无导出记录。", "No export records yet.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">{t("类型", "Type")}</th>
                  <th className="px-5 py-3">{t("状态", "Status")}</th>
                  <th className="px-5 py-3">{t("商品数", "Products")}</th>
                  <th className="px-5 py-3">{t("文件", "File")}</th>
                  <th className="px-5 py-3">{t("创建时间", "Created At")}</th>
                  <th className="px-5 py-3">{t("备注", "Notes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-4 text-zinc-700">
                      {t(exportTypeLabels[record.export_type].zh, exportTypeLabels[record.export_type].en)}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={[
                          "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                          exportStatusStyles[record.status],
                        ].join(" ")}
                      >
                        {t(exportStatusLabels[record.status].zh, exportStatusLabels[record.status].en)}
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
                          {record.filename ?? t("下载文件", "Download file")}
                        </a>
                      ) : (
                        <span className="text-zinc-400">{t("无文件", "No file")}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-700">{formatDate(record.created_at, language === "zh" ? "zh-CN" : "en-US")}</td>
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
          <h3 className="text-base font-semibold text-zinc-950">{t("商品草稿列表", "Product Drafts")}</h3>
          <p className="mt-1 text-sm text-zinc-500">{t("勾选多个商品后导出。", "Select multiple products before exporting.")}</p>
        </div>

        {products.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">{t("暂无可导出的商品草稿。", "No exportable product drafts.")}</div>
        ) : visibleProducts.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500">{t("没有匹配当前筛选的商品。", "No products match the current filters.")}</div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {pagedProducts.map((product) => {
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
                      {t("无图片", "No image")}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-950">
                      {product.title || t("未填写标题", "Untitled")}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      SKU: {product.sku || "-"} · {t("类型：", "Type: ")}{product.product_type || "-"} · {t("价格：", "Price: ")}
                      {formatPrice(product.price)}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {t(`图片：${imageCount(product)} 张 · 创建时间：${formatDate(product.created_at, "zh-CN")}`, `Images: ${imageCount(product)} · Created: ${formatDate(product.created_at, "en-US")}`)}
                    </span>
                  </span>
                  <span className="self-start">
                    <span
                      className={[
                        "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                        statusStyles[product.status],
                      ].join(" ")}
                    >
                      {t(statusLabels[product.status].zh, statusLabels[product.status].en)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {visibleProducts.length > 0 ? (
          <div className="px-5 pb-5">
            <Pagination
              page={currentPage}
              totalPages={productsTotalPages}
              total={visibleProducts.length}
              unitZh="个"
              unitEn="products"
              onChange={setPage}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
