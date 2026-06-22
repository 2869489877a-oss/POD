import { NextResponse } from "next/server";

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
    const supabase = createSupabaseServiceRoleClient();

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
      )
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (copyrightStatus) {
      query = query.eq("copyright_status", copyrightStatus);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { assets: [], error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ assets: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { assets: [], error: error instanceof Error ? error.message : "读取素材失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  let body: { asset_ids?: unknown; dry_run?: unknown; force?: unknown };

  try {
    body = (await request.json()) as { asset_ids?: unknown; dry_run?: unknown; force?: unknown };
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
