import { NextResponse } from "next/server";

import { mapReviewedStatusToAssetCopyrightStatus } from "@/lib/infringement/detector";
import { computeAverageHashFromUrl } from "@/lib/infringement/image-hash";
import type { InfringementCheckStatus } from "@/lib/infringement/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ReviewRequest = {
  reviewer_note?: unknown;
  status?: unknown;
};

const allowedReviewStatuses = new Set<InfringementCheckStatus>(["clear", "review", "risky", "blocked"]);

function getCheckId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

function normalizeReviewerNote(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// 标记「禁用」时,自动把这张图的感知 hash 存进参考库,用于拦截以后重复 / 近似的上传。
// 全程 best-effort:任何失败都不影响复核结果的保存。
async function addBlockedAssetToReferenceLibrary(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetId: string,
) {
  try {
    const { data: asset } = await supabase
      .from("assets")
      .select("original_url,processed_url,print_extract_url,cutout_url,preferred_design_url,filename")
      .eq("id", assetId)
      .single();

    const assetRow = asset as {
      cutout_url?: string | null;
      filename?: string | null;
      original_url?: string | null;
      preferred_design_url?: string | null;
      print_extract_url?: string | null;
      processed_url?: string | null;
    } | null;
    const imageUrl =
      assetRow?.preferred_design_url ??
      assetRow?.print_extract_url ??
      assetRow?.cutout_url ??
      assetRow?.processed_url ??
      assetRow?.original_url;

    if (!imageUrl) return;

    const imageHash = await computeAverageHashFromUrl(imageUrl).catch(() => null);
    if (!imageHash) return;

    // 去重:同一指纹已在库里就跳过
    const { data: existing } = await supabase
      .from("infringement_reference_items")
      .select("id")
      .eq("image_hash", imageHash)
      .limit(1);
    if (existing && existing.length > 0) return;

    await supabase.from("infringement_reference_items").insert({
      category: "visual_review",
      description: "人工标记为禁用的素材,自动加入参考库,用于拦截重复 / 近似的上传。",
      image_hash: imageHash,
      image_url: imageUrl,
      is_active: true,
      library_type: "high_risk",
      notes: `auto:blocked-asset ${assetId}`,
      risk_level: "high",
      severity: "high",
      source_label: "禁用素材指纹",
      terms: [],
      title: assetRow?.filename || "已禁用素材指纹",
    });
  } catch {
    // best-effort:忽略所有错误
  }
}

export async function PATCH(request: Request) {
  const checkId = getCheckId(request);

  if (!checkId) {
    return NextResponse.json({ error: "缺少检测记录 ID" }, { status: 400 });
  }

  let body: ReviewRequest;

  try {
    body = (await request.json()) as ReviewRequest;
  } catch {
    return NextResponse.json({ error: "无法读取复核参数" }, { status: 400 });
  }

  if (typeof body.status !== "string" || !allowedReviewStatuses.has(body.status as InfringementCheckStatus)) {
    return NextResponse.json({ error: "请选择有效的复核状态" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: check, error: checkError } = await supabase
      .from("infringement_checks")
      .select("id,asset_id")
      .eq("id", checkId)
      .single();

    if (checkError) {
      throw new Error(checkError.message);
    }

    const assetId = (check as unknown as { asset_id: string }).asset_id;
    const nextStatus = body.status as InfringementCheckStatus;
    const { data: updatedCheck, error: updateError } = await supabase
      .from("infringement_checks")
      .update({
        reviewer_note: normalizeReviewerNote(body.reviewer_note),
        reviewed_at: new Date().toISOString(),
        status: nextStatus,
      })
      .eq("id", checkId)
      .select(
        [
          "id",
          "asset_id",
          "status",
          "risk_level",
          "confidence",
          "detection_source",
          "matched_rules",
          "evidence",
          "recommendation",
          "reviewer_note",
          "reviewed_at",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    const { error: assetUpdateError } = await supabase
      .from("assets")
      .update({ copyright_status: mapReviewedStatusToAssetCopyrightStatus(nextStatus) })
      .eq("id", assetId);

    if (assetUpdateError) {
      throw new Error(assetUpdateError.message);
    }

    // 标「禁用」→ 自动把该图指纹加入高风险参考库(重复/近似上传会被命中)。
    if (nextStatus === "blocked") {
      await addBlockedAssetToReferenceLibrary(supabase, assetId);
    }

    return NextResponse.json({ check: updatedCheck, ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存复核结果失败" },
      { status: 500 },
    );
  }
}
