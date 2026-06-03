"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type InfringementAssetRow = {
  copyright_status: string;
  created_at: string;
  filename: string;
  format: string;
  height: number;
  id: string;
  original_url: string;
  processed_url: string | null;
  source: string;
  width: number;
};

export type InfringementCheckRow = {
  asset_id: string;
  confidence: number;
  created_at: string;
  detection_source: string;
  evidence: unknown;
  id: string;
  matched_rules: unknown;
  recommendation: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  risk_level: string;
  status: string;
  updated_at: string;
};

export type InfringementListItem = {
  asset: InfringementAssetRow;
  latest_check: InfringementCheckRow | null;
};

const assetColumns = [
  "id",
  "original_url",
  "processed_url",
  "filename",
  "width",
  "height",
  "format",
  "source",
  "copyright_status",
  "created_at",
].join(",");

const checkColumns = [
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
].join(",");

export async function fetchInfringementDashboard(): Promise<{
  error: string | null;
  items: InfringementListItem[];
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [assetsResponse, checksResponse] = await Promise.all([
      supabase.from("assets").select(assetColumns).order("created_at", { ascending: false }).limit(200),
      supabase.from("infringement_checks").select(checkColumns).order("created_at", { ascending: false }).limit(1000),
    ]);

    if (assetsResponse.error) return { error: assetsResponse.error.message, items: [] };
    if (checksResponse.error) return { error: checksResponse.error.message, items: [] };

    const latestCheckByAssetId = new Map<string, InfringementCheckRow>();
    for (const check of (checksResponse.data ?? []) as unknown as InfringementCheckRow[]) {
      if (!latestCheckByAssetId.has(check.asset_id)) {
        latestCheckByAssetId.set(check.asset_id, check);
      }
    }

    return {
      error: null,
      items: ((assetsResponse.data ?? []) as unknown as InfringementAssetRow[]).map((asset) => ({
        asset,
        latest_check: latestCheckByAssetId.get(asset.id) ?? null,
      })),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "读取侵权检测数据失败",
      items: [],
    };
  }
}
