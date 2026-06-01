"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";

type UploadResult = {
  asset_id?: string;
  error?: string;
  file_size: number;
  filename: string;
  format?: string;
  height?: number;
  original_url?: string;
  success: boolean;
  width?: number;
};

type UploadResponse = {
  error?: string;
  failed_count?: number;
  results?: UploadResult[];
  success_count?: number;
};

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const unsupportedFiles = useMemo(
    () =>
      files.filter((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        return !ACCEPTED_MIME_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.has(extension);
      }),
    [files],
  );
  const successCount = results.filter((result) => result.success).length;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
    setMessage(null);
    setResults([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setMessage("请选择至少一张图片");
      return;
    }

    setIsUploading(true);
    setMessage(null);
    setResults([]);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/upload", {
        body: formData,
        method: "POST",
      });
      const data = (await response.json()) as UploadResponse;

      setResults(data.results ?? []);

      if (!response.ok && data.error) {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  }

  function clearSelection() {
    setFiles([]);
    setMessage(null);
    setResults([]);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <div
          className={[
            "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragging ? "border-emerald-400 bg-emerald-50" : "border-slate-300 hover:border-slate-400",
          ].join(" ")}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = Array.from(e.dataTransfer.files);
            if (dropped.length > 0) { setFiles(dropped); setResults([]); setMessage(null); }
          }}
        >
          <svg className="mx-auto h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-700">
            {isDragging ? "松开鼠标上传文件" : "拖拽图片到此处，或点击选择"}
          </p>
          <p className="mt-1 text-xs text-slate-500">支持 jpg、jpeg、png、webp，可一次选择多张</p>
          <input
            id="images"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>

        {files.length > 0 ? (
          <div className="mt-5 rounded-md bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-zinc-950">已选择 {files.length} 张图片</p>
              <button
                type="button"
                onClick={clearSelection}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-950"
              >
                清空
              </button>
            </div>
            <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto text-sm text-zinc-600">
              {files.map((file) => (
                <li key={`${file.name}-${file.lastModified}`} className="flex justify-between gap-4">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <span className="shrink-0 text-zinc-500">{formatFileSize(file.size)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {unsupportedFiles.length > 0 ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            有 {unsupportedFiles.length} 个文件格式可能不受支持，提交后会返回失败原因。
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {message}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isUploading || files.length === 0}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isUploading ? "上传中..." : "开始上传"}
          </button>
          {successCount > 0 ? (
            <Link
              href="/assets"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
            >
              前往素材库
            </Link>
          ) : null}
        </div>
      </form>

      {results.length > 0 ? (
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h3 className="text-base font-semibold text-zinc-950">上传结果</h3>
            <p className="mt-1 text-sm text-zinc-500">
              成功 {successCount} 张，失败 {results.length - successCount} 张
            </p>
          </div>
          <div className="divide-y divide-zinc-200">
            {results.map((result) => (
              <div
                key={`${result.filename}-${result.asset_id ?? result.error}`}
                className="grid gap-3 px-6 py-4 md:grid-cols-[1fr_120px_160px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950">{result.filename}</p>
                  {result.success && result.width && result.height ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {result.width} x {result.height} · {result.format} ·{" "}
                      {formatFileSize(result.file_size)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-red-600">{result.error}</p>
                  )}
                </div>
                <div>
                  <span
                    className={[
                      "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                      result.success
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700",
                    ].join(" ")}
                  >
                    {result.success ? "上传成功" : "上传失败"}
                  </span>
                </div>
                {result.original_url ? (
                  <a
                    href={result.original_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    查看原图
                  </a>
                ) : (
                  <span className="text-sm text-zinc-400">无文件地址</span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
