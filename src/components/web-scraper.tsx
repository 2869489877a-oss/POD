"use client";

/* eslint-disable @next/next/no-img-element -- Scraped image previews come from arbitrary remote domains. */

import { useState } from "react";
import { useSettings } from "@/lib/settings/context";

type ScrapeResult = {
  images: string[];
  count: number;
  source_url: string;
};

type ImportResult = {
  source_url: string;
  success: boolean;
  asset_id?: string;
  filename?: string;
  error?: string;
};

export function WebScraper() {
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const { t } = useSettings();

  async function handleScrape() {
    const trimmed = url.trim();
    if (!trimmed) {
      setMessage(t("请输入网页 URL", "Please enter a web page URL"));
      return;
    }
    setLoading(true);
    setMessage(null);
    setImages([]);
    setSelected(new Set());
    setImportResults([]);

    try {
      const res = await fetch("/api/scrape-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as ScrapeResult & { error?: string };
      if (!res.ok) {
        setMessage(data.error || t("抓取失败", "Scrape failed"));
        return;
      }
      if (data.count === 0) {
        setMessage(t("未在页面中找到图片", "No images were found on this page"));
        return;
      }
      setImages(data.images);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("请求失败", "Request failed"));
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(imgUrl: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(imgUrl)) next.delete(imgUrl);
      else next.add(imgUrl);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(images));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleImport() {
    if (selected.size === 0) {
      setMessage(t("请至少选择一张图片", "Please select at least one image"));
      return;
    }
    setImporting(true);
    setMessage(null);
    setImportResults([]);

    try {
      const res = await fetch("/api/import-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: Array.from(selected) }),
      });
      const data = await res.json();
      setImportResults(data.results || []);
      setMessage(t(`导入完成：成功 ${data.success_count} 张，失败 ${data.failed_count} 张`, `Import complete: ${data.success_count} succeeded, ${data.failed_count} failed`));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("导入失败", "Import failed"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <div className="rounded-md border border-zinc-200 bg-white p-6">
        <label htmlFor="scrape-url" className="block text-sm font-medium text-zinc-950">
          {t("网页 URL", "Web Page URL")}
        </label>
        <p className="mt-1 text-xs text-zinc-500">
          {t("粘贴电商列表页或商品页链接，系统自动提取页面中的所有图片。", "Paste an ecommerce list or product page link. The system will extract images from the page.")}
        </p>
        <div className="mt-3 flex gap-3">
          <input
            id="scrape-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/products"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
          />
          <button
            onClick={handleScrape}
            disabled={loading}
            className="shrink-0 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {loading ? t("抓取中...", "Scraping...") : t("提取图片", "Extract Images")}
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-md border p-3 text-sm ${importResults.length > 0 && importResults.some(r => r.success) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {message}
        </div>
      )}

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-950">
              {t(`找到 ${images.length} 张图片，已选择 ${selected.size} 张`, `Found ${images.length} images, ${selected.size} selected`)}
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-sm font-medium text-zinc-600 hover:text-zinc-950">{t("全选", "Select All")}</button>
              <button onClick={deselectAll} className="text-sm font-medium text-zinc-600 hover:text-zinc-950">{t("取消全选", "Deselect All")}</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {images.map((imgUrl) => (
              <div
                key={imgUrl}
                onClick={() => toggleSelect(imgUrl)}
                className={`relative cursor-pointer overflow-hidden rounded-md border-2 transition ${selected.has(imgUrl) ? "border-emerald-500 ring-2 ring-emerald-200" : "border-zinc-200 hover:border-zinc-400"}`}
              >
                <img
                  src={imgUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {selected.has(imgUrl) && (
                  <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">✓</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {importing ? t("导入中...", "Importing...") : t(`导入选中 ${selected.size} 张到素材库`, `Import ${selected.size} selected to Assets`)}
            </button>
          </div>
        </div>
      )}

      {/* Import Results */}
      {importResults.length > 0 && (
        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h3 className="text-base font-semibold text-zinc-950">{t("导入结果", "Import Results")}</h3>
          </div>
          <div className="divide-y divide-zinc-200">
            {importResults.map((r) => (
              <div key={r.source_url} className="flex items-center justify-between gap-3 px-6 py-3">
                <span className="min-w-0 truncate text-sm text-zinc-700">{r.filename || r.source_url}</span>
                <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${r.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {r.success ? t("成功", "Success") : r.error || t("失败", "Failed")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
