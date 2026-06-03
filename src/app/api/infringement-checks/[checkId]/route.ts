import { NextResponse } from "next/server";

import { mapReviewedStatusToAssetCopyrightStatus } from "@/lib/infringement/detector";
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

    return NextResponse.json({ check: updatedCheck, ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存复核结果失败" },
      { status: 500 },
    );
  }
}
