import type { ProductDraftStatus, ProductDraftView } from "@/lib/products/types";

type AssetLookup = {
  original_url: string;
  processed_url: string | null;
};

type MockupOutputLookup = {
  output_images: unknown;
};

export type ProductDraftRow = {
  asset_id: string;
  bullet_points: unknown;
  created_at: string;
  description: string | null;
  id: string;
  images: unknown;
  mockup_output_id: string | null;
  price: number | null;
  product_type: string | null;
  sku: string | null;
  status: ProductDraftStatus;
  tags: unknown;
  title: string | null;
  updated_at: string;
};

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function parseLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeProductDraft(
  draft: ProductDraftRow,
  assetsById: Map<string, AssetLookup>,
  mockupOutputsById: Map<string, MockupOutputLookup>,
): ProductDraftView {
  const ownImages = toStringArray(draft.images);
  const mockupImages = draft.mockup_output_id
    ? toStringArray(mockupOutputsById.get(draft.mockup_output_id)?.output_images)
    : [];
  const asset = assetsById.get(draft.asset_id);
  const fallbackImage = asset?.processed_url ?? asset?.original_url ?? null;
  const images = ownImages.length > 0 ? ownImages : mockupImages;

  return {
    asset_id: draft.asset_id,
    bullet_points: toStringArray(draft.bullet_points),
    created_at: draft.created_at,
    description: draft.description,
    id: draft.id,
    images,
    main_image_url: images[0] ?? fallbackImage,
    mockup_output_id: draft.mockup_output_id,
    price: draft.price,
    product_type: draft.product_type,
    sku: draft.sku,
    status: draft.status,
    tags: toStringArray(draft.tags),
    title: draft.title,
    updated_at: draft.updated_at,
  };
}
