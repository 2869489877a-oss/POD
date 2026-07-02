import { NextResponse } from "next/server";

import { createAssetDeleteJob, getAssetDeleteJob } from "@/lib/assets/delete-jobs";
import {
  deleteAssets,
  getAssetUsageSummary,
  parseDeleteAssetIds,
} from "@/lib/assets/delete";
import { elapsedMs, logActivity } from "@/lib/observability/activity-log";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ASSET_STATUSES = new Set(["uploaded", "processing", "processed", "failed"]);
const COPYRIGHT_STATUSES = new Set([
  "unknown",
  "owned",
  "commercial_ok",
  "risky",
  "forbidden",
]);
const DEFAULT_ASSETS_LIMIT = 120;
const MAX_ASSETS_LIMIT = 300;

function getBoundedInt(searchParams: URLSearchParams, key: string, fallback: number, min: number, max: number) {
  const raw = searchParams.get(key);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function getFilter(searchParams: URLSearchParams, key: string, allowedValues: Set<string>) {
  const value = searchParams.get(key);

  if (!value || value === "all") {
    return null;
  }

  if (!allowedValues.has(value)) {
    throw new Error(`Invalid ${key} filter`);
  }

  return value;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = getFilter(url.searchParams, "status", ASSET_STATUSES);
    const copyrightStatus = getFilter(
      url.searchParams,
      "copyright_status",
      COPYRIGHT_STATUSES,
    );
    const limit = getBoundedInt(url.searchParams, "limit", DEFAULT_ASSETS_LIMIT, 1, MAX_ASSETS_LIMIT);
    const offset = getBoundedInt(url.searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
    const supabase = createSupabaseServiceRoleClient();
    const deleteJobId = url.searchParams.get("delete_job_id")?.trim();

    if (deleteJobId) {
      const job = await getAssetDeleteJob(supabase, deleteJobId);
      return NextResponse.json({ job });
    }

    let query = supabase
      .from("assets")
      .select(
        [
          "id",
          "original_url",
          "processed_url",
          "print_extract_url",
          "cutout_url",
          "preferred_design_url",
          "filename",
          "file_size",
          "width",
          "height",
          "format",
          "status",
          "source",
          "copyright_status",
          "created_at",
          "updated_at",
        ].join(","),
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (copyrightStatus) {
      query = query.eq("copyright_status", copyrightStatus);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { assets: [], error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      assets: data ?? [],
      limit,
      offset,
      total: count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { assets: [], error: error instanceof Error ? error.message : "读取素材失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  let body: { asset_ids?: unknown; dry_run?: unknown; force?: unknown; sync?: unknown };

  try {
    body = (await request.json()) as { asset_ids?: unknown; dry_run?: unknown; force?: unknown; sync?: unknown };
  } catch {
    return NextResponse.json({ error: "无法读取删除参数", results: [] }, { status: 400 });
  }

  try {
    const assetIds = parseDeleteAssetIds(body.asset_ids);
    const usage = await getAssetUsageSummary(assetIds);
    const requiresConfirmation = usage.some((item) => item.used);

    if (body.dry_run === true) {
      return NextResponse.json(
        {
          message: requiresConfirmation
            ? "该素材已被使用，删除可能影响商品草稿，是否继续？"
            : "素材可删除",
          requires_confirmation: requiresConfirmation,
          results: [],
          usage,
        },
        { status: 200 },
      );
    }

    if (requiresConfirmation && body.force !== true) {
      return NextResponse.json(
        {
          message: "Asset is used by jobs, mockups, or product drafts. Confirm force delete to continue.",
          requires_confirmation: true,
          results: [],
          usage,
        },
        { status: 409 },
      );
    }

    if (body.sync !== true) {
      const supabase = createSupabaseServiceRoleClient();
      const job = await createAssetDeleteJob(supabase, assetIds, {
        force: body.force === true,
      });

      await logActivity({
        action: "assets.delete.queued",
        durationMs: elapsedMs(startedAt),
        entityType: "assets",
        metadata: {
          asset_count: assetIds.length,
          forced: body.force === true,
          job_id: job.id,
        },
        request,
        status: "success",
      });

      return NextResponse.json(
        {
          failed_count: 0,
          job,
          job_id: job.id,
          queued: true,
          results: assetIds.map((assetId) => ({
            asset_id: assetId,
            success: true,
          })),
          success_count: assetIds.length,
          usage,
        },
        { status: 202 },
      );
    }

    const deleteResult = await deleteAssets(assetIds, {
      force: body.force === true,
    });

    if (deleteResult.requiresConfirmation) {
      return NextResponse.json(
        {
          message: deleteResult.requiresConfirmation
            ? "该素材已被使用，删除可能影响商品草稿，是否继续？"
            : "素材可删除",
          requires_confirmation: deleteResult.requiresConfirmation,
          results: [],
          usage: deleteResult.usage,
        },
        { status: deleteResult.requiresConfirmation ? 409 : 200 },
      );
    }

    const successCount = deleteResult.results.filter((result) => result.success).length;
    const failedCount = deleteResult.results.length - successCount;

    await logActivity({
      action: "assets.delete",
      durationMs: elapsedMs(startedAt),
      entityType: "assets",
      metadata: {
        asset_count: assetIds.length,
        failed_count: failedCount,
        forced: body.force === true,
        success_count: successCount,
      },
      request,
      status: successCount > 0 ? "success" : "failure",
    });

    return NextResponse.json(
      {
        failed_count: failedCount,
        results: deleteResult.results,
        success_count: successCount,
        usage: deleteResult.usage,
      },
      { status: successCount > 0 ? 200 : 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "删除素材失败",
        results: [],
      },
      { status: 400 },
    );
  }
}
