import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { resolveCollectorLibraryPath } from "@/lib/storage/collector-library";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
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
    diskPath = resolveCollectorLibraryPath(relativePath);
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
        "Cache-Control": "public, max-age=604800",
        "Content-Length": String(fileStat.size),
        "Content-Type": contentType,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
