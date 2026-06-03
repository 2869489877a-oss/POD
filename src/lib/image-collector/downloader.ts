import type { DownloadedPublicImage } from "@/lib/image-collector/types";
import { safeFetchBinary, safeFetchText } from "@/lib/network/safe-fetch";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

function normalizeContentType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export async function downloadPublicHtml(url: string) {
  try {
    return await safeFetchText(url, {
      allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "POD-Image-Collector/1.0",
      },
      maxBytes: MAX_HTML_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Error(`页面下载失败：${error instanceof Error ? error.message : "网络错误"}，URL: ${url}`);
  }
}

export async function downloadPublicImage(url: string): Promise<DownloadedPublicImage> {
  let image: Awaited<ReturnType<typeof safeFetchBinary>>;

  try {
    image = await safeFetchBinary(url, {
      allowedContentTypes: ["image/"],
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
        "User-Agent": "POD-Image-Collector/1.0",
      },
      maxBytes: MAX_IMAGE_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Error(`图片下载失败：${error instanceof Error ? error.message : "网络错误"}，URL: ${url}`);
  }

  const contentType = normalizeContentType(image.contentType);

  if (!contentType.startsWith("image/")) {
    throw new Error(`图片下载失败：响应不是图片类型 ${contentType || "unknown"}，URL: ${url}`);
  }

  if (contentType.includes("svg")) {
    throw new Error(`暂不支持采集 SVG 图片，URL: ${url}`);
  }

  return {
    buffer: image.buffer,
    contentType,
    fileSize: image.buffer.byteLength,
  };
}
