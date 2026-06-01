"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function fetchAssetsForProcessing(): Promise<{ error: string | null; assets: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("assets")
      .select("id, original_url, processed_url, print_extract_url, cutout_url, preferred_design_url, filename, format, width, height, status")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return { error: error.message, assets: [] };
    return { error: null, assets: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取素材失败", assets: [] };
  }
}

export async function fetchExportProducts(): Promise<{ error: string | null; products: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("product_drafts")
      .select("id, title, sku, product_type, status, images, created_at")
      .in("status", ["draft", "ready"])
      .order("created_at", { ascending: false });

    if (error) return { error: error.message, products: [] };
    return { error: null, products: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取商品列表失败", products: [] };
  }
}
