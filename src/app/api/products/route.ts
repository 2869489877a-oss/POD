import { NextResponse } from "next/server";

import {
  normalizeProductDraft,
  toStringArray,
  type ProductDraftRow,
} from "@/lib/products/normalize";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CreateProductDraftRequest = {
  asset_id?: unknown;
  mockup_output_id?: unknown;
  price?: unknown;
  product_type?: unknown;
  sku?: unknown;
  source?: unknown;
  title?: unknown;
};

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

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function optionalPrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const price = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("价格必须是大于等于 0 的数字");
  }

  return price;
}

async function listProductDrafts() {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: draftData, error: draftError }, { data: assetData, error: assetError }, { data: mockupData, error: mockupError }] =
    await Promise.all([
      supabase.from("product_drafts").select(productColumns).order("created_at", { ascending: false }),
      supabase.from("assets").select("id,original_url,processed_url"),
      supabase.from("mockup_outputs").select("id,output_images"),
    ]);

  if (draftError) {
    throw new Error(draftError.message);
  }

  if (assetError) {
    throw new Error(assetError.message);
  }

  if (mockupError) {
    throw new Error(mockupError.message);
  }

  const assetsById = new Map(
    ((assetData ?? []) as unknown as Array<{ id: string; original_url: string; processed_url: string | null }>).map(
      (asset) => [asset.id, asset],
    ),
  );
  const mockupOutputsById = new Map(
    ((mockupData ?? []) as unknown as Array<{ id: string; output_images: unknown }>).map(
      (output) => [output.id, output],
    ),
  );

  return ((draftData ?? []) as unknown as ProductDraftRow[]).map((draft) =>
    normalizeProductDraft(draft, assetsById, mockupOutputsById),
  );
}

export async function GET() {
  try {
    const products = await listProductDrafts();
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取商品草稿失败", products: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: CreateProductDraftRequest;

  try {
    body = (await request.json()) as CreateProductDraftRequest;
  } catch {
    return NextResponse.json({ error: "无法读取商品草稿参数" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    const source = body.source === "mockup_output" ? "mockup_output" : "asset";
    let assetId = optionalString(body.asset_id);
    let mockupOutputId: string | null = null;
    let images: string[] = [];

    if (source === "mockup_output") {
      mockupOutputId = optionalString(body.mockup_output_id);

      if (!mockupOutputId) {
        return NextResponse.json({ error: "请选择一个套图结果" }, { status: 400 });
      }

      const { data: mockupOutput, error: mockupError } = await supabase
        .from("mockup_outputs")
        .select("id,asset_id,output_images")
        .eq("id", mockupOutputId)
        .single();

      if (mockupError) {
        throw new Error(mockupError.message);
      }

      const output = mockupOutput as unknown as {
        asset_id: string;
        output_images: unknown;
      };
      assetId = output.asset_id;
      images = toStringArray(output.output_images);
    }

    if (!assetId) {
      return NextResponse.json({ error: "请选择一张素材图片" }, { status: 400 });
    }

    if (images.length === 0) {
      const { data: asset, error: assetError } = await supabase
        .from("assets")
        .select("original_url,processed_url")
        .eq("id", assetId)
        .single();

      if (assetError) {
        throw new Error(assetError.message);
      }

      const assetImage = asset as unknown as {
        original_url: string;
        processed_url: string | null;
      };
      images = [assetImage.processed_url ?? assetImage.original_url];
    }

    const { data, error } = await supabase
      .from("product_drafts")
      .insert({
        asset_id: assetId,
        bullet_points: [],
        description: null,
        images,
        mockup_output_id: mockupOutputId,
        price: optionalPrice(body.price),
        product_type: optionalString(body.product_type),
        sku: optionalString(body.sku),
        status: "draft",
        tags: [],
        title: optionalString(body.title),
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      product_id: (data as unknown as { id: string }).id,
      products: await listProductDrafts(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "商品草稿创建失败" },
      { status: 500 },
    );
  }
}
