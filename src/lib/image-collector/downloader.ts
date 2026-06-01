import { isHttpUrl } from "@/lib/image-collector/url";
import type { DownloadedPublicImage } from "@/lib/image-collector/types";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, accept: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": "POD-Image-Collector/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseBuffer(response: Response, maxBytes: number, url: string) {
  const contentLength = response.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)}MB 限制，URL: ${url}`);
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      throw new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)}MB 限制，URL: ${url}`);
    }

    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      total += value.byteLength;

      if (total > maxBytes) {
        throw new Error(`文件超过 ${Math.round(maxBytes / 1024 / 1024)}MB 限制，URL: ${url}`);
      }

      chunks.push(value);
    }
  }

  return Buffer.concat(chunks);
}

function normalizeContentType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export async function downloadPublicHtml(url: string) {
  if (!isHttpUrl(url)) {
    throw new Error(`页面 URL 必须是 http 或 https：${url}`);
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(url, "text/html,application/xhtml+xml");
  } catch (error) {
    throw new Error(`页面下载失败：${error instanceof Error ? error.message : "网络错误"}，URL: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`页面下载失败：HTTP ${response.status}，URL: ${url}`);
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));

  if (contentType && !contentType.includes("html") && contentType !== "text/plain") {
    throw new Error(`页面不是 HTML 内容：${contentType}，URL: ${url}`);
  }

  const buffer = await readResponseBuffer(response, MAX_HTML_BYTES, url);
  return buffer.toString("utf8");
}

export async function downloadPublicImage(url: string): Promise<DownloadedPublicImage> {
  if (!isHttpUrl(url)) {
    throw new Error(`图片 URL 必须是 http 或 https：${url}`);
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(url, "image/avif,image/webp,image/png,image/jpeg,image/*");
  } catch (error) {
    throw new Error(`图片下载失败：${error instanceof Error ? error.message : "网络错误"}，URL: ${url}`);
  }

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}，URL: ${url}`);
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));

  if (!contentType.startsWith("image/")) {
    throw new Error(`图片下载失败：响应不是图片类型 ${contentType || "unknown"}，URL: ${url}`);
  }

  if (contentType.includes("svg")) {
    throw new Error(`暂不支持采集 SVG 图片，URL: ${url}`);
  }

  const buffer = await readResponseBuffer(response, MAX_IMAGE_BYTES, url);

  return {
    buffer,
    contentType,
    fileSize: buffer.byteLength,
  };
}
