import "server-only";

import {
  normalizeProductDraft,
  type ProductDraftRow,
} from "@/lib/products/normalize";
import type { ProductDraftView } from "@/lib/products/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const EXPORTABLE_PRODUCT_STATUSES = ["draft", "ready"] as const;

const productColumns = [
  "id",
  "asset_id",
  "mockup_output_id",
  "title",
  "description",
  "tags",
  "bullet_points",
  "sku",
  "price",
  "product_type",
  "status",
  "images",
  "created_at",
  "updated_at",
].join(",");

function parseProductIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("请选择要导出的商品");
  }

  const ids = value.map((item) => (typeof item === "string" ? item.trim() : ""));

  if (ids.some((id) => id.length === 0)) {
    throw new Error("商品 ID 参数无效");
  }

  const uniqueIds = Array.from(new Set(ids));

  if (uniqueIds.length === 0) {
    throw new Error("请选择要导出的商品");
  }

  return uniqueIds;
}

function isExportableStatus(status: string) {
  return (EXPORTABLE_PRODUCT_STATUSES as readonly string[]).includes(status);
}

async function normalizeDraftRows(rows: ProductDraftRow[]) {
  const supabase = createSupabaseServiceRoleClient();
  const [assetsResponse, mockupsResponse] = await Promise.all([
    supabase.from("assets").select("id,original_url,processed_url"),
    supabase.from("mockup_outputs").select("id,output_images"),
  ]);

  if (assetsResponse.error) {
    throw new Error(assetsResponse.error.message);
  }

  if (mockupsResponse.error) {
    throw new Error(mockupsResponse.error.message);
  }

  const assetsById = new Map(
    (
      (assetsResponse.data ?? []) as unknown as Array<{
        id: string;
        original_url: string;
        processed_url: string | null;
      }>
    ).map((asset) => [asset.id, asset]),
  );
  const mockupOutputsById = new Map(
    (
      (mockupsResponse.data ?? []) as unknown as Array<{
        id: string;
        output_images: unknown;
      }>
    ).map((output) => [output.id, output]),
  );

  return rows.map((draft) => normalizeProductDraft(draft, assetsById, mockupOutputsById));
}

export async function listExportableProducts() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("product_drafts")
    .select(productColumns)
    .in("status", [...EXPORTABLE_PRODUCT_STATUSES])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeDraftRows((data ?? []) as unknown as ProductDraftRow[]);
}

export async function getProductsByIds(
  productIds: unknown,
  options: { requireExportable?: boolean } = {},
) {
  const requireExportable = options.requireExportable ?? true;
  const ids = parseProductIds(productIds);
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("product_drafts")
    .select(productColumns)
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as ProductDraftRow[];

  if (rows.length !== ids.length) {
    throw new Error("部分商品草稿不存在，请刷新后重试");
  }

  if (requireExportable && rows.some((row) => !isExportableStatus(row.status))) {
    throw new Error("只能导出 status = draft 或 ready 的商品");
  }

  const products = await normalizeDraftRows(rows);
  const productsById = new Map(products.map((product) => [product.id, product]));

  return ids.map((id) => productsById.get(id)).filter((product): product is ProductDraftView => Boolean(product));
}

export async function getExportProductsByIds(productIds: unknown) {
  return getProductsByIds(productIds, { requireExportable: true });
}

export function getProductImageUrls(product: ProductDraftView) {
  const urls = product.images.length > 0 ? product.images : product.main_image_url ? [product.main_image_url] : [];
  return Array.from(new Set(urls.filter(Boolean)));
}
