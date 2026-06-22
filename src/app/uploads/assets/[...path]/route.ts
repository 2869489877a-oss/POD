import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";

import { resolveLocalAssetPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { path: pathSegments } = await params;
  const relativePath = pathSegments.join("/");

  let diskPath: string;

  try {
    diskPath = resolveLocalAssetPath(relativePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  try {
    const fileStat = await stat(diskPath);

    if (!fileStat.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    const stream = Readable.toWeb(createReadStream(diskPath)) as unknown as ReadableStream;
    const contentType = CONTENT_TYPES[path.extname(diskPath).toLowerCase()] ?? "application/octet-stream";

    return new Response(stream, {
      headers: {
        "Cache-Control": "public, max-age=2592000, immutable",
        "Content-Length": String(fileStat.size),
        "Content-Type": contentType,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}