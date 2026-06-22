import "server-only";

import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";

const DEFAULT_PUBLIC_PATH = "/uploads/assets";

type SaveLocalAssetInput = {
  buffer: Buffer;
  filename: string;
  request?: Request;
};

type SaveLocalAssetAtPathInput = {
  buffer: Buffer | Uint8Array;
  relativePath: string;
  request?: Request;
};

export type SavedLocalAsset = {
  diskPath: string;
  publicUrl: string;
  relativePath: string;
};

export type LocalAssetDeleteResult = {
  deleted: boolean;
  error?: string;
  matched: boolean;
  relativePath?: string;
};

function getDefaultAssetsRoot() {
  if (process.platform === "win32") {
    return path.join(/* turbopackIgnore: true */ process.cwd(), ".local-assets", "assets");
  }

  return "/wmsFile/pod-ai-data/assets";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "image";
}

function encodeRelativePath(relativePath: string) {
  return relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getForwardedOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();

  if (!host) {
    return new URL(request.url).origin;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}

export function getLocalAssetsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_ASSETS_DIR || getDefaultAssetsRoot());
}

export function getLocalAssetsPublicBaseUrl(request?: Request) {
  const configuredBase = process.env.LOCAL_ASSETS_PUBLIC_URL_BASE?.trim();

  if (configuredBase) {
    return stripTrailingSlash(configuredBase);
  }

  if (request) {
    return `${getForwardedOrigin(request)}${DEFAULT_PUBLIC_PATH}`;
  }

  return DEFAULT_PUBLIC_PATH;
}

export function resolveLocalAssetPath(relativePath: string) {
  if (relativePath.includes("\0")) {
    throw new Error("Invalid local asset path");
  }

  const parts = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === ".." || path.isAbsolute(part))) {
    throw new Error("Invalid local asset path");
  }

  const root = getLocalAssetsRoot();
  const target = path.resolve(root, ...parts);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (target !== root && !target.startsWith(rootWithSeparator)) {
    throw new Error("Local asset path escapes storage root");
  }

  return target;
}

export function buildLocalAssetPublicUrl(relativePath: string, request?: Request) {
  return `${getLocalAssetsPublicBaseUrl(request)}/${encodeRelativePath(relativePath)}`;
}

export async function saveLocalAssetAtPath({
  buffer,
  relativePath,
  request,
}: SaveLocalAssetAtPathInput): Promise<SavedLocalAsset> {
  const diskPath = resolveLocalAssetPath(relativePath);

  await mkdir(path.dirname(diskPath), { recursive: true });
  await writeFile(diskPath, buffer, { flag: "wx" });

  return {
    diskPath,
    publicUrl: buildLocalAssetPublicUrl(relativePath, request),
    relativePath,
  };
}

export async function saveLocalAsset({ buffer, filename, request }: SaveLocalAssetInput): Promise<SavedLocalAsset> {
  const datePath = new Date().toISOString().slice(0, 10);
  const relativePath = `${datePath}/${randomUUID()}-${sanitizeFilename(filename)}`;

  return saveLocalAssetAtPath({ buffer, relativePath, request });
}

export function localAssetRelativePathFromPublicUrl(publicUrl: string | null) {
  if (!publicUrl) {
    return null;
  }

  try {
    const publicBasePath = new URL(getLocalAssetsPublicBaseUrl(), "http://local.invalid").pathname;
    const normalizedBasePath = stripTrailingSlash(publicBasePath);
    const pathname = new URL(publicUrl, "http://local.invalid").pathname;
    const prefix = `${normalizedBasePath}/`;

    if (!pathname.startsWith(prefix)) {
      return null;
    }

    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

export async function deleteLocalAssetByPublicUrl(publicUrl: string | null): Promise<LocalAssetDeleteResult> {
  const relativePath = localAssetRelativePathFromPublicUrl(publicUrl);

  if (!relativePath) {
    return { deleted: false, matched: false };
  }

  try {
    await rm(resolveLocalAssetPath(relativePath), { force: true });
    return { deleted: true, matched: true, relativePath };
  } catch (error) {
    return {
      deleted: false,
      error: getErrorMessage(error),
      matched: true,
      relativePath,
    };
  }
}