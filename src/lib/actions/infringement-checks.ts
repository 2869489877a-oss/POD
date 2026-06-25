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

export type InfringementDashboardStatus = "all" | "unchecked" | "pending" | "clear" | "review" | "risky" | "blocked";

export type InfringementDashboardStatusCounts = {
  blocked: number;
  clear: number;
  pending: number;
  review: number;
  risky: number;
  total: number;
  unchecked: number;
};

export type InfringementDashboardInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: InfringementDashboardStatus;
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
const DEFAULT_DASHBOARD_PAGE_SIZE = 8;
const MAX_DASHBOARD_PAGE_SIZE = 48;
const MAX_DASHBOARD_ASSET_ID_LIMIT = 2000;

const dashboardStatuses = ["unchecked", "pending", "clear", "review", "risky", "blocked"] as const;

type InfringementDashboardViewRow = {
  asset_copyright_status: string | null;
  asset_created_at: string | null;
  asset_cutout_url: string | null;
  asset_filename: string | null;
  asset_format: string | null;
  asset_height: number | null;
  asset_id: string;
  asset_original_url: string | null;
  asset_preferred_design_url: string | null;
  asset_print_extract_url: string | null;
  asset_processed_url: string | null;
  asset_source: string | null;
  asset_width: number | null;
  check_confidence: number | null;
  check_created_at: string | null;
  check_detection_source: string | null;
  check_evidence: unknown;
  check_id: string | null;
  check_matched_rules: unknown;
  check_recommendation: string | null;
  check_reviewed_at: string | null;
  check_reviewer_note: string | null;
  check_risk_level: string | null;
  check_status: string | null;
  check_updated_at: string | null;
  latest_status: string | null;
};

type NormalizedDashboardInput = {
  offset: number;
  page: number;
  pageSize: number;
  search: string;
  status: InfringementDashboardStatus;
};

function emptyStatusCounts(): InfringementDashboardStatusCounts {
  return {
    blocked: 0,
    clear: 0,
    pending: 0,
    review: 0,
    risky: 0,
    total: 0,
    unchecked: 0,
  };
}

function isDashboardStatus(value: unknown): value is InfringementDashboardStatus {
  return typeof value === "string" && (value === "all" || dashboardStatuses.includes(value as (typeof dashboardStatuses)[number]));
}

function normalizeDashboardInput(input: InfringementDashboardInput = {}): NormalizedDashboardInput {
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.max(
    1,
    Math.min(MAX_DASHBOARD_PAGE_SIZE, Math.floor(Number(input.pageSize) || DEFAULT_DASHBOARD_PAGE_SIZE)),
  );
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 200) : "";
  const status = isDashboardStatus(input.status) ? input.status : "all";

  return {
    offset: (page - 1) * pageSize,
    page,
    pageSize,
    search,
    status,
  };
}

function applyDashboardFilters<Query>(
  query: Query,
  input: Pick<NormalizedDashboardInput, "search" | "status">,
): Query {
  let nextQuery = query as Query & {
    eq: (column: string, value: string) => Query;
    ilike: (column: string, pattern: string) => Query;
  };

  if (input.status !== "all") {
    nextQuery = nextQuery.eq("latest_status", input.status) as typeof nextQuery;
  }

  if (input.search) {
    nextQuery = nextQuery.ilike("search_text", `%${input.search.replace(/[%_]/g, "\\$&")}%`) as typeof nextQuery;
  }

  return nextQuery as Query;
}

function isMissingDashboardViewError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return (
    record.code === "42P01" ||
    record.code === "PGRST205" ||
    /infringement_dashboard_items|does not exist|schema cache|relation .* not found/i.test(message)
  );
}

function coerceCheckStatus(value: string | null): string {
  return value && dashboardStatuses.includes(value as (typeof dashboardStatuses)[number]) ? value : "pending";
}

function itemFromDashboardRow(row: InfringementDashboardViewRow): InfringementListItem {
  const asset: InfringementAssetRow = {
    copyright_status: row.asset_copyright_status,
    created_at: row.asset_created_at,
    cutout_url: row.asset_cutout_url,
    filename: row.asset_filename,
    format: row.asset_format,
    height: row.asset_height,
    id: row.asset_id,
    original_url: row.asset_original_url,
    preferred_design_url: row.asset_preferred_design_url,
    print_extract_url: row.asset_print_extract_url,
    processed_url: row.asset_processed_url,
    source: row.asset_source,
    width: row.asset_width,
  };

  if (!row.check_id) {
    return { asset, latest_check: null };
  }

  return {
    asset,
    latest_check: {
      asset_id: row.asset_id,
      confidence: row.check_confidence ?? 0,
      created_at: row.check_created_at ?? row.asset_created_at ?? new Date(0).toISOString(),
      detection_source: row.check_detection_source ?? "unknown",
      evidence: row.check_evidence ?? {},
      id: row.check_id,
      matched_rules: row.check_matched_rules ?? [],
      recommendation: row.check_recommendation,
      reviewed_at: row.check_reviewed_at,
      reviewer_note: row.check_reviewer_note,
      risk_level: row.check_risk_level ?? "unknown",
      status: coerceCheckStatus(row.check_status),
      updated_at: row.check_updated_at ?? row.check_created_at ?? row.asset_created_at ?? new Date(0).toISOString(),
    },
  };
}

async function countDashboardRows(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  input: Pick<NormalizedDashboardInput, "search" | "status">,
) {
  const query = applyDashboardFilters(
    supabase
      .from("infringement_dashboard_items")
      .select("asset_id", { count: "exact", head: true }),
    input,
  );
  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function fetchDashboardStatusCounts(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  input: Pick<NormalizedDashboardInput, "search">,
) {
  const counts = emptyStatusCounts();
  const [total, unchecked, pending, clear, review, risky, blocked] = await Promise.all([
    countDashboardRows(supabase, { search: input.search, status: "all" }),
    countDashboardRows(supabase, { search: input.search, status: "unchecked" }),
    countDashboardRows(supabase, { search: input.search, status: "pending" }),
    countDashboardRows(supabase, { search: input.search, status: "clear" }),
    countDashboardRows(supabase, { search: input.search, status: "review" }),
    countDashboardRows(supabase, { search: input.search, status: "risky" }),
    countDashboardRows(supabase, { search: input.search, status: "blocked" }),
  ]);

  counts.total = total;
  counts.unchecked = unchecked;
  counts.pending = pending;
  counts.clear = clear;
  counts.review = review;
  counts.risky = risky;
  counts.blocked = blocked;

  return counts;
}

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

function itemMatchesDashboardFilter(item: InfringementListItem, input: Pick<NormalizedDashboardInput, "search" | "status">) {
  const latestStatus = item.latest_check?.status ?? "unchecked";
  if (input.status !== "all" && latestStatus !== input.status) {
    return false;
  }

  if (!input.search) {
    return true;
  }

  const search = input.search.toLowerCase();
  return [
    item.asset.filename,
    item.asset.original_url,
    item.asset.processed_url,
    item.asset.print_extract_url,
    item.asset.cutout_url,
    item.asset.preferred_design_url,
    item.asset.source,
    item.asset.copyright_status,
    item.latest_check?.status,
    item.latest_check?.risk_level,
    item.latest_check?.detection_source,
    item.latest_check?.recommendation,
    item.latest_check?.reviewer_note,
    JSON.stringify(item.latest_check?.matched_rules ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function statusCountsFromItems(items: InfringementListItem[]) {
  const counts = emptyStatusCounts();
  counts.total = items.length;

  for (const item of items) {
    const status = item.latest_check?.status ?? "unchecked";
    if (status === "unchecked") counts.unchecked += 1;
    if (status === "pending") counts.pending += 1;
    if (status === "clear") counts.clear += 1;
    if (status === "review") counts.review += 1;
    if (status === "risky") counts.risky += 1;
    if (status === "blocked") counts.blocked += 1;
  }

  return counts;
}

async function fetchInfringementDashboardFallback(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  input: NormalizedDashboardInput,
) {
  const { assets } = await fetchDashboardAssets(supabase);
  const checks = await fetchChecksForAssetIds(supabase, assets.map((asset) => asset.id));
  const allItems = latestItemsFromRows(assets, checks);
  const countScopeItems = input.search
    ? allItems.filter((item) => itemMatchesDashboardFilter(item, { search: input.search, status: "all" }))
    : allItems;
  const filteredItems = allItems.filter((item) => itemMatchesDashboardFilter(item, input));
  const items = filteredItems.slice(input.offset, input.offset + input.pageSize);

  return {
    has_more: input.offset + items.length < filteredItems.length,
    items,
    page: input.page,
    page_size: input.pageSize,
    status_counts: statusCountsFromItems(countScopeItems),
    total_count: filteredItems.length,
  };
}

export async function fetchInfringementDashboard(input: InfringementDashboardInput = {}): Promise<{
  error: string | null;
  has_more?: boolean;
  items: InfringementListItem[];
  page?: number;
  page_size?: number;
  status_counts?: InfringementDashboardStatusCounts;
  total_count?: number;
}> {
  const normalizedInput = normalizeDashboardInput(input);

  try {
    const supabase = createSupabaseServiceRoleClient();
    const query = applyDashboardFilters(
      supabase
        .from("infringement_dashboard_items")
        .select("*", { count: "exact" })
        .order("asset_created_at", { ascending: false })
        .range(normalizedInput.offset, normalizedInput.offset + normalizedInput.pageSize - 1),
      normalizedInput,
    );
    const [{ data, error, count }, statusCounts] = await Promise.all([
      query,
      fetchDashboardStatusCounts(supabase, normalizedInput),
    ]);

    if (error) {
      throw error;
    }

    const items = ((data ?? []) as unknown as InfringementDashboardViewRow[]).map(itemFromDashboardRow);

    return {
      error: null,
      has_more: normalizedInput.offset + items.length < (count ?? 0),
      items,
      page: normalizedInput.page,
      page_size: normalizedInput.pageSize,
      status_counts: statusCounts,
      total_count: count ?? items.length,
    };
  } catch (error) {
    if (isMissingDashboardViewError(error)) {
      try {
        const supabase = createSupabaseServiceRoleClient();
        const fallback = await fetchInfringementDashboardFallback(supabase, normalizedInput);
        return {
          error: null,
          ...fallback,
        };
      } catch (fallbackError) {
        return {
          error: fallbackError instanceof Error ? fallbackError.message : "读取侵权检测数据失败",
          items: [],
        };
      }
    }

    return {
      error: error instanceof Error ? error.message : "读取侵权检测数据失败",
      items: [],
    };
  }
}

export async function fetchInfringementDashboardAssetIds(
  input: InfringementDashboardInput & { limit?: number } = {},
): Promise<{
  asset_ids: string[];
  error: string | null;
  limited?: boolean;
}> {
  const normalizedInput = normalizeDashboardInput({
    ...input,
    page: 1,
    pageSize: Math.min(MAX_DASHBOARD_PAGE_SIZE, Number(input.limit) || MAX_DASHBOARD_PAGE_SIZE),
  });
  const limit = Math.max(
    1,
    Math.min(MAX_DASHBOARD_ASSET_ID_LIMIT, Math.floor(Number(input.limit) || MAX_DASHBOARD_ASSET_ID_LIMIT)),
  );

  try {
    const supabase = createSupabaseServiceRoleClient();
    const query = applyDashboardFilters(
      supabase
        .from("infringement_dashboard_items")
        .select("asset_id")
        .order("asset_created_at", { ascending: false })
        .range(0, limit),
      normalizedInput,
    );
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as unknown as Array<{ asset_id: string }>;
    return {
      asset_ids: rows.slice(0, limit).map((row) => row.asset_id).filter(Boolean),
      error: null,
      limited: rows.length > limit,
    };
  } catch (error) {
    if (isMissingDashboardViewError(error)) {
      try {
        const supabase = createSupabaseServiceRoleClient();
        const { assets } = await fetchDashboardAssets(supabase);
        const checks = await fetchChecksForAssetIds(supabase, assets.map((asset) => asset.id));
        const items = latestItemsFromRows(assets, checks).filter((item) => itemMatchesDashboardFilter(item, normalizedInput));
        return {
          asset_ids: items.slice(0, limit).map((item) => item.asset.id),
          error: null,
          limited: items.length > limit,
        };
      } catch (fallbackError) {
        return {
          asset_ids: [],
          error: fallbackError instanceof Error ? fallbackError.message : "读取侵权检测素材失败",
        };
      }
    }

    return {
      asset_ids: [],
      error: error instanceof Error ? error.message : "读取侵权检测素材失败",
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
