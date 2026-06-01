const IMAGE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i;
const NON_IMAGE_EXTENSION_PATTERN = /\.(css|js|json|html?|pdf|txt|xml|zip)(?:$|\?)/i;
const SMALL_ASSET_PATTERN = /(favicon|logo|icon|sprite)/i;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function isHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeUrl(baseUrl: string, value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    url.hash = "";

    if (!isHttpUrl(url.toString())) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function isLikelyImageUrl(url: string) {
  if (!isHttpUrl(url)) {
    return false;
  }

  const lower = url.toLowerCase();

  if (lower.startsWith("data:") || lower.includes("base64,")) {
    return false;
  }

  if (lower.includes(".svg") || lower.includes("image/svg")) {
    return false;
  }

  if (SMALL_ASSET_PATTERN.test(lower)) {
    return false;
  }

  if (IMAGE_EXTENSION_PATTERN.test(lower)) {
    return true;
  }

  return !NON_IMAGE_EXTENSION_PATTERN.test(lower);
}

function sanitizePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

export function safePathSegment(value: string, fallback = "folder") {
  return sanitizePathSegment(value, fallback);
}

export function safeFilenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const rawName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "");
    const filename = sanitizePathSegment(rawName, "image.jpg");

    if (/\.(jpe?g|png|webp|gif|avif)$/i.test(filename)) {
      return filename;
    }

    return `${filename.replace(/\.+$/g, "") || "image"}.jpg`;
  } catch {
    return "image.jpg";
  }
}

export function buildRootFolderName(mainFolderName: string) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");

  return `${timestamp}-${safePathSegment(mainFolderName, "collection")}`;
}
