export type ProductDraftStatus = "draft" | "ready" | "exported" | "failed";

export type ProductDraftView = {
  asset_id: string;
  bullet_points: string[];
  created_at: string;
  description: string | null;
  id: string;
  images: string[];
  main_image_url: string | null;
  mockup_output_id: string | null;
  price: number | null;
  product_type: string | null;
  sku: string | null;
  status: ProductDraftStatus;
  tags: string[];
  title: string | null;
  updated_at: string;
};

export type ProductAssetOption = {
  filename: string;
  id: string;
  image_url: string;
};

export type MockupOutputOption = {
  asset_id: string;
  created_at: string;
  id: string;
  output_images: string[];
  status: string;
};
