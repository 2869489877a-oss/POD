import { PageShell } from "@/components/page-shell";
import { ProductsManager } from "@/components/products-manager";
import {
  normalizeProductDraft,
  toStringArray,
  type ProductDraftRow,
} from "@/lib/products/normalize";
import type {
  MockupOutputOption,
  ProductAssetOption,
  ProductDraftView,
} from "@/lib/products/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

async function getInitialData(): Promise<{
  assetOptions: ProductAssetOption[];
  error: string | null;
  mockupOutputOptions: MockupOutputOption[];
  products: ProductDraftView[];
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [draftsResponse, assetsResponse, mockupsResponse] = await Promise.all([
      supabase.from("product_drafts").select(productColumns).order("created_at", { ascending: false }),
      supabase
        .from("assets")
        .select("id,filename,original_url,processed_url")
        .order("created_at", { ascending: false }),
      supabase
        .from("mockup_outputs")
        .select("id,asset_id,output_images,status,created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (draftsResponse.error) {
      return {
        assetOptions: [],
        error: draftsResponse.error.message,
        mockupOutputOptions: [],
        products: [],
      };
    }

    if (assetsResponse.error) {
      return {
        assetOptions: [],
        error: assetsResponse.error.message,
        mockupOutputOptions: [],
        products: [],
      };
    }

    if (mockupsResponse.error) {
      return {
        assetOptions: [],
        error: mockupsResponse.error.message,
        mockupOutputOptions: [],
        products: [],
      };
    }

    const assets = (assetsResponse.data ?? []) as unknown as Array<{
      filename: string;
      id: string;
      original_url: string;
      processed_url: string | null;
    }>;
    const mockups = (mockupsResponse.data ?? []) as unknown as Array<{
      asset_id: string;
      created_at: string;
      id: string;
      output_images: unknown;
      status: string;
    }>;
    const assetsById = new Map(
      assets.map((asset) => [
        asset.id,
        {
          original_url: asset.original_url,
          processed_url: asset.processed_url,
        },
      ]),
    );
    const mockupOutputsById = new Map(
      mockups.map((mockup) => [
        mockup.id,
        {
          output_images: mockup.output_images,
        },
      ]),
    );
    const products = ((draftsResponse.data ?? []) as unknown as ProductDraftRow[]).map((draft) =>
      normalizeProductDraft(draft, assetsById, mockupOutputsById),
    );

    return {
      assetOptions: assets.map((asset) => ({
        filename: asset.filename,
        id: asset.id,
        image_url: asset.processed_url ?? asset.original_url,
      })),
      error: null,
      mockupOutputOptions: mockups.map((mockup) => ({
        asset_id: mockup.asset_id,
        created_at: mockup.created_at,
        id: mockup.id,
        output_images: toStringArray(mockup.output_images),
        status: mockup.status,
      })),
      products,
    };
  } catch (error) {
    return {
      assetOptions: [],
      error: error instanceof Error ? error.message : "读取商品草稿失败",
      mockupOutputOptions: [],
      products: [],
    };
  }
}

export default async function ProductsPage() {
  const { assetOptions, error, mockupOutputOptions, products } = await getInitialData();

  return (
    <PageShell title="商品草稿管理" description="用于管理待完善、待导出或待上架的商品草稿。">
      <ProductsManager
        assetOptions={assetOptions}
        initialError={error}
        mockupOutputOptions={mockupOutputOptions}
        products={products}
      />
    </PageShell>
  );
}
