import { NextResponse } from "next/server";

import { elapsedMs, logActivity } from "@/lib/observability/activity-log";
import {
  addCollectorItemsToRiskLibrary,
  deleteCollectorItems,
  listCollectorItems,
  parseCollectorRelativePaths,
  promoteCollectorItems,
  saveCollectorFile,
} from "@/lib/storage/collector-library";

export const runtime = "nodejs";

type CollectorBody = {
  action?: unknown;
  relative_paths?: unknown;
};

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function resultStatus(results: Array<{ success: boolean }>) {
  return results.some((result) => result.success) ? 200 : 400;
}

async function handleUpload(request: Request) {
  const startedAt = performance.now();
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Unable to read upload form.", results: [] }, { status: 400 });
  }

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Please select at least one image.", results: [] }, { status: 400 });
  }

  const employeeName = stringValue(formData.get("employee_name")) || stringValue(formData.get("employeeName"));
  const siteType = stringValue(formData.get("site_type")) || stringValue(formData.get("siteType"));
  const sourceUrl = stringValue(formData.get("source_url")) || stringValue(formData.get("sourceUrl"));
  const pageUrl = stringValue(formData.get("page_url")) || stringValue(formData.get("pageUrl"));
  const results = [];

  for (const file of files) {
    try {
      const item = await saveCollectorFile({
        employeeName,
        file,
        pageUrl,
        request,
        siteType,
        sourceUrl,
      });
      results.push({
        item,
        filename: item.filename,
        public_url: item.publicUrl,
        relative_path: item.relativePath,
        success: true,
      });
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : "Upload failed",
        filename: file.name,
        success: false,
      });
    }
  }

  const successCount = results.filter((result) => result.success).length;
  const failedCount = results.length - successCount;

  await logActivity({
    action: "collector_library.upload",
    durationMs: elapsedMs(startedAt),
    entityType: "collector_library",
    metadata: {
      employee_name: employeeName || "未分类",
      failed_count: failedCount,
      file_count: files.length,
      site_type: siteType || "generic",
      success_count: successCount,
    },
    request,
    status: successCount > 0 ? "success" : "failure",
  });

  return NextResponse.json(
    {
      failed_count: failedCount,
      ok: successCount > 0,
      results,
      success_count: successCount,
    },
    { status: resultStatus(results) },
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 2000);
    const endDate = url.searchParams.get("end_date") || undefined;
    const startDate = url.searchParams.get("start_date") || undefined;
    const items = await listCollectorItems({ endDate, limit, request, startDate });
    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read collector library", items: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return handleUpload(request);
  }

  const startedAt = performance.now();
  let body: CollectorBody;

  try {
    body = (await request.json()) as CollectorBody;
  } catch {
    return NextResponse.json({ error: "Unable to read request body", results: [] }, { status: 400 });
  }

  if (body.action !== "promote" && body.action !== "add_to_risk_library") {
    return NextResponse.json({ error: "Unsupported collector action", results: [] }, { status: 400 });
  }

  const relativePaths = parseCollectorRelativePaths(body.relative_paths);

  if (relativePaths.length === 0) {
    return NextResponse.json({ error: "Please select images to import", results: [] }, { status: 400 });
  }

  const isRiskLibraryAction = body.action === "add_to_risk_library";
  const results = isRiskLibraryAction
    ? await addCollectorItemsToRiskLibrary(relativePaths, request)
    : await promoteCollectorItems(relativePaths, request);
  const successCount = results.filter((result) => result.success).length;
  const failedCount = results.length - successCount;

  await logActivity({
    action: isRiskLibraryAction ? "collector_library.add_to_risk_library" : "collector_library.promote",
    durationMs: elapsedMs(startedAt),
    entityType: isRiskLibraryAction ? "infringement_reference_library" : "collector_library",
    metadata: {
      failed_count: failedCount,
      file_count: relativePaths.length,
      success_count: successCount,
    },
    request,
    status: successCount > 0 ? "success" : "failure",
  });

  return NextResponse.json(
    {
      failed_count: failedCount,
      ok: successCount > 0,
      results,
      success_count: successCount,
    },
    { status: resultStatus(results) },
  );
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  let body: CollectorBody;

  try {
    body = (await request.json()) as CollectorBody;
  } catch {
    return NextResponse.json({ error: "Unable to read request body", results: [] }, { status: 400 });
  }

  const relativePaths = parseCollectorRelativePaths(body.relative_paths);

  if (relativePaths.length === 0) {
    return NextResponse.json({ error: "Please select images to delete", results: [] }, { status: 400 });
  }

  const results = await deleteCollectorItems(relativePaths);
  const successCount = results.filter((result) => result.success).length;
  const failedCount = results.length - successCount;

  await logActivity({
    action: "collector_library.delete",
    durationMs: elapsedMs(startedAt),
    entityType: "collector_library",
    metadata: {
      failed_count: failedCount,
      file_count: relativePaths.length,
      success_count: successCount,
    },
    request,
    status: successCount > 0 ? "success" : "failure",
  });

  return NextResponse.json(
    {
      failed_count: failedCount,
      ok: successCount > 0,
      results,
      success_count: successCount,
    },
    { status: resultStatus(results) },
  );
}
