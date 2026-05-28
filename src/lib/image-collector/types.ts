import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImageCollectionItem, ImageCollectionRun } from "@/types/image-collector";

export type ImageCollectorSupabase = SupabaseClient;

export type ImageCollectionTemplateRow = {
  cron_expression: string | null;
  id: string;
  keywords: unknown;
  last_run_at: string | null;
  main_folder_name: string;
  max_images: number;
  name: string;
  next_run_at: string | null;
  schedule_enabled: boolean;
  status: string;
  storage_prefix: string;
};

export type ImageCollectionSourceRow = {
  enabled: boolean;
  folder_name: string;
  id: string;
  site_name: string;
  start_url: string;
  template_id: string;
};

export type DownloadedPublicImage = {
  buffer: Buffer;
  contentType: string;
  fileSize: number;
};

export type UploadedCollectedImage = {
  publicUrl: string;
  storagePath: string;
};

export type CollectionCandidate = {
  imageUrl: string;
  source: ImageCollectionSourceRow;
  sourcePageUrl: string;
};

export type ImageCollectionItemWithPreview = ImageCollectionItem & {
  asset_original_url: string | null;
  source_folder_name: string | null;
  source_site_name: string | null;
};

export type ImageCollectionRunDetail = ImageCollectionRun & {
  items: ImageCollectionItemWithPreview[];
  template_name: string | null;
};

export type CollectedImageResult = {
  assetId: string | null;
  errorMessage: string | null;
  filename: string | null;
  imageUrl: string;
  sourceId: string;
  sourcePageUrl: string;
  status: "downloaded" | "failed";
  storagePath: string | null;
};
