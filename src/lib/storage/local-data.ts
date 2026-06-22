import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

function getDefaultLocalDataRoot() {
  if (process.platform === "win32") {
    return path.join(/* turbopackIgnore: true */ process.cwd(), ".local-data");
  }

  return "/wmsFile/pod-ai-data";
}

export function getLocalDataRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR || getDefaultLocalDataRoot());
}

export function resolveLocalDataPath(relativePath: string) {
  if (relativePath.includes("\0")) {
    throw new Error("Invalid local data path");
  }

  const parts = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === ".." || path.isAbsolute(part))) {
    throw new Error("Invalid local data path");
  }

  const root = getLocalDataRoot();
  const target = path.resolve(root, ...parts);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (target !== root && !target.startsWith(rootWithSeparator)) {
    throw new Error("Local data path escapes storage root");
  }

  return target;
}

export function localDatePath(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function appendLocalJsonl(relativePath: string, value: unknown) {
  const target = resolveLocalDataPath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(value)}\n`, "utf8");
}

export async function appendLocalJsonlRows(relativePath: string, values: unknown[]) {
  if (values.length === 0) return;

  const target = resolveLocalDataPath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8");
}
