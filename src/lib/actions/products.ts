"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function fetchProducts(): Promise<{ error: string | null; products: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("product_drafts")
      .select("id, asset_id, mockup_output_id, title, description, tags, bullet_points, sku, price, product_type, status, images, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return { error: error.message, products: [] };
    return { error: null, products: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取商品草稿失败", products: [] };
  }
}

export async function createProduct(payload: {
  asset_id?: string;
  mockup_output_id?: string;
  product_type?: string;
}): Promise<{ error: string | null; product_id: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("product_drafts")
      .insert({
        asset_id: payload.asset_id,
        mockup_output_id: payload.mockup_output_id,
        product_type: payload.product_type,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) return { error: error.message, product_id: null };
    return { error: null, product_id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "创建商品草稿失败", product_id: null };
  }
}

export async function updateProduct(
  productId: string,
  payload: Record<string, unknown>,
): Promise<{ error: string | null; ok: boolean }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("product_drafts")
      .update(payload)
      .eq("id", productId);

    if (error) return { error: error.message, ok: false };
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "更新商品草稿失败", ok: false };
  }
}
