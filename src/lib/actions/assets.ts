"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const PAGE_SIZE = 24;

const assetColumns = [
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
].join(",");

export async function fetchAssetsAction(
  status: string,
  copyrightStatus: string,
  page: number = 1,
): Promise<{ assets: unknown[]; error: string | null; total: number }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("assets")
      .select(assetColumns, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (copyrightStatus !== "all") {
      query = query.eq("copyright_status", copyrightStatus);
    }

    const { data, error, count } = await query;
    if (error) return { assets: [], error: error.message, total: 0 };
    return { assets: data ?? [], error: null, total: count ?? 0 };
  } catch (e) {
    return { assets: [], error: e instanceof Error ? e.message : "读取素材失败", total: 0 };
  }
}
