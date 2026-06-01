export type ImageDerivativeType =
  | "print_extract_raw"
  | "print_extract_final"
  | "cutout"
  | "mask"
  | "preview";

export type ImageDerivativeStatus = "pending" | "processing" | "completed" | "failed";

export type PrintExtractionMode =
  | "auto"
  | "light_garment"
  | "dark_garment"
  | "high_contrast"
  | "manual_rect";

export type CutoutMode =
  | "auto_background"
  | "white_background"
  | "black_background"
  | "solid_background"
  | "edge_flood_fill";

export type ProcessingBBox = {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
};

export type ProcessingMetrics = {
  background_color?: string;
  component_count?: number;
  confidence?: number;
  mask_area?: number;
  processing_ms?: number;
  retained_area_ratio?: number;
};

export type PrintExtractionOptions = {
  color_tolerance?: number;
  crop_to_bbox?: boolean;
  feather_radius?: number;
  manual_rect?: ProcessingBBox;
  max_work_size?: number;
  min_component_area?: number;
  mode: PrintExtractionMode;
};

export type CutoutOptions = {
  background_tolerance?: number;
  crop_to_bbox?: boolean;
  edge_sample_size?: number;
  feather_radius?: number;
  keep_shadow?: boolean;
  mode: CutoutMode;
};

export type ImageDerivative = {
  asset_id: string;
  bbox: ProcessingBBox;
  created_at: string;
  derivative_type: ImageDerivativeType;
  error_message: string | null;
  height: number | null;
  id: string;
  job_id: string | null;
  job_item_id: string | null;
  mask_url: string | null;
  metrics: ProcessingMetrics;
  options: CutoutOptions | PrintExtractionOptions | Record<string, unknown>;
  output_url: string | null;
  preview_url: string | null;
  source_url: string;
  status: ImageDerivativeStatus;
  updated_at: string;
  width: number | null;
};
