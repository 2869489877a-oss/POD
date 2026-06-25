"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type InfringementAssetRow = {
  copyright_status: string | null;
  created_at: string | null;
  cutout_url: string | null;
  filename: string | null;
  format: string | null;
  height: number | null;
  id: string;
  original_url: string | null;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
  source: string | null;
  width: number | null;
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
  "print_extract_url",
  "cutout_url",
  "preferred_design_url",
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

const DEFAULT_DASHBOARD_LIMIT = Math.max(
  1,
  Math.min(1000, Number(process.env.INFRINGEMENT_DASHBOARD_LIMIT ?? 240) || 240),
);

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchDashboardAssets(supabase: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const { data, error } = await supabase
    .from("assets")
    .select(assetColumns)
    .order("created_at", { ascending: false })
    .range(0, DEFAULT_DASHBOARD_LIMIT - 1);

  if (error) {
    throw new Error(error.message);
  }

  return {
    assets: (data ?? []) as unknown as InfringementAssetRow[],
    totalCount: (data ?? []).length,
  };
}

async function fetchChecksForAssetIds(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetIds: string[],
) {
  if (assetIds.length === 0) return [];

  const rows: InfringementCheckRow[] = [];

  for (const chunk of chunkArray(assetIds, 500)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("infringement_checks")
        .select(checkColumns)
        .in("asset_id", chunk)
        .order("created_at", { ascending: false })
        .range(from, from + 999);

      if (error) {
        throw new Error(error.message);
      }

      rows.push(...((data ?? []) as unknown as InfringementCheckRow[]));
      if ((data ?? []).length < 1000) break;
    }
  }

  return rows;
}

function latestItemsFromRows(assets: InfringementAssetRow[], checks: InfringementCheckRow[]) {
  const latestCheckByAssetId = new Map<string, InfringementCheckRow>();
  for (const check of checks) {
    if (!latestCheckByAssetId.has(check.asset_id)) {
      latestCheckByAssetId.set(check.asset_id, check);
    }
  }

  return assets.map((asset) => ({
    asset,
    latest_check: latestCheckByAssetId.get(asset.id) ?? null,
  }));
}

export async function fetchInfringementDashboard(): Promise<{
  error: string | null;
  items: InfringementListItem[];
  total_count?: number;
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { assets, totalCount } = await fetchDashboardAssets(supabase);
    const checks = await fetchChecksForAssetIds(supabase, assets.map((asset) => asset.id));

    return {
      error: null,
      items: latestItemsFromRows(assets, checks),
      total_count: totalCount,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "读取侵权检测数据失败",
      items: [],
    };
  }
}

export async function fetchInfringementItemsByAssetIds(assetIds: string[]): Promise<{
  error: string | null;
  items: InfringementListItem[];
}> {
  try {
    const ids = Array.from(new Set(assetIds.filter(Boolean)));
    if (ids.length === 0) {
      return { error: null, items: [] };
    }

    const supabase = createSupabaseServiceRoleClient();
    const [assetResult, checkResult] = await Promise.all([
      supabase
        .from("assets")
        .select(assetColumns)
        .in("id", ids)
        .order("created_at", { ascending: false }),
      supabase
        .from("infringement_checks")
        .select(checkColumns)
        .in("asset_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    if (assetResult.error) {
      throw new Error(assetResult.error.message);
    }

    if (checkResult.error) {
      throw new Error(checkResult.error.message);
    }

    return {
      error: null,
      items: latestItemsFromRows(
        (assetResult.data ?? []) as unknown as InfringementAssetRow[],
        (checkResult.data ?? []) as unknown as InfringementCheckRow[],
      ),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "读取侵权检测数据失败",
      items: [],
    };
  }
}
