"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

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
): Promise<{ assets: unknown[]; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("assets")
      .select(assetColumns)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (copyrightStatus !== "all") {
      query = query.eq("copyright_status", copyrightStatus);
    }

    const { data, error } = await query;
    if (error) return { assets: [], error: error.message };
    return { assets: data ?? [], error: null };
  } catch (e) {
    return { assets: [], error: e instanceof Error ? e.message : "读取素材失败" };
  }
}
