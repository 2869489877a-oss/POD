import { NextResponse } from "next/server";

import { completeInfringementWorkerItem } from "@/lib/infringement/worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { completeLocalWorkerItem } from "@/lib/local-worker/image-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getItemId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const jobsIndex = segments.indexOf("jobs");
  return jobsIndex >= 0 ? decodeURIComponent(segments[jobsIndex + 1] ?? "") : "";
}

function parseJsonField(value: FormDataEntryValue | null): Record<string, unknown> {
  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

async function readFile(form: FormData, fieldName: string) {
  const value = form.get(fieldName);

  if (!value || typeof value === "string") {
    return null;
  }

  return {
    buffer: Buffer.from(await value.arrayBuffer()),
    contentType: value.type || "application/octet-stream",
  };
}

async function readFiles(form: FormData, fieldName: string) {
  const files: Array<{ buffer: Buffer; contentType: string }> = [];

  for (const value of form.getAll(fieldName)) {
    if (!value || typeof value === "string") {
      continue;
    }

    files.push({
      buffer: Buffer.from(await value.arrayBuffer()),
      contentType: value.type || "application/octet-stream",
    });
  }

  return files;
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const itemId = getItemId(request);
  if (!itemId) {
    return NextResponse.json({ error: "缺少 worker 子任务 ID", ok: false }, { status: 400 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { infringement?: unknown; kind?: unknown };
      const infringement = body.infringement;

      if (body.kind !== "infringement_check" || typeof infringement !== "object" || infringement === null) {
        return NextResponse.json({ error: "JSON 回写只支持 infringement_check", ok: false }, { status: 400 });
      }

      const result = await completeInfringementWorkerItem(
        createSupabaseServiceRoleClient(),
        itemId,
        infringement as Parameters<typeof completeInfringementWorkerItem>[2],
      );

      return NextResponse.json({
        ok: true,
        result,
      });
    }

    const form = await request.formData();
    const mockupOutputs = await readFiles(form, "outputs");
    const output = (await readFile(form, "output")) ?? (await readFile(form, "final")) ?? mockupOutputs[0] ?? null;

    if (!output) {
      return NextResponse.json({ error: "缺少 output 文件", ok: false }, { status: 400 });
    }

    const result = await completeLocalWorkerItem(createSupabaseServiceRoleClient(), itemId, {
      bbox: parseJsonField(form.get("bbox")),
      height: parseOptionalNumber(form.get("height")),
      mask: await readFile(form, "mask"),
      metrics: parseJsonField(form.get("metrics")),
      mockupOutputs,
      output,
      preview: await readFile(form, "preview"),
      raw: await readFile(form, "raw"),
      width: parseOptionalNumber(form.get("width")),
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "本地 worker 结果回写失败", ok: false },
      { status: 500 },
    );
  }
}
