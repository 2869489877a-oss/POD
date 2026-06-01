export type ImageCollectionTemplateStatus = "active" | "archived";

export type ImageCollectionRunStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "partial_failed";

export type ImageCollectionRunType = "manual" | "scheduled";

export type ImageCollectionItemStatus = "pending" | "downloaded" | "failed" | "skipped";

export type ImageCollectionScheduleFrequency = "manual" | "hourly" | "daily" | "weekly" | "custom";

export type ImageCollectionSource = {
  created_at: string;
  enabled: boolean;
  folder_name: string;
  id: string;
  options: Record<string, unknown>;
  site_name: string;
  start_url: string;
  template_id: string;
  updated_at: string;
};

export type ImageCollectionSourceInput = {
  enabled: boolean;
  folder_name: string;
  options?: Record<string, unknown>;
  site_name: string;
  start_url: string;
};

export type ImageCollectionTemplate = {
  created_at: string;
  cron_expression: string | null;
  id: string;
  keywords: string[];
  main_folder_name: string;
  max_images: number;
  name: string;
  last_run_at: string | null;
  next_run_at: string | null;
  schedule_enabled: boolean;
  sources: ImageCollectionSource[];
  status: ImageCollectionTemplateStatus;
  storage_prefix: string;
  updated_at: string;
};

export type ImageCollectionTemplateInput = {
  cron_expression: string | null;
  keywords: string[];
  main_folder_name: string;
  max_images: number;
  name: string;
  schedule_enabled: boolean;
  sources: ImageCollectionSourceInput[];
  storage_prefix: string;
};

export type ImageCollectionRun = {
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
  id: string;
  root_folder: string;
  run_type: ImageCollectionRunType;
  started_at: string | null;
  status: ImageCollectionRunStatus;
  template_id: string | null;
  total_downloaded: number;
  total_failed: number;
  total_found: number;
};

export type ImageCollectionItem = {
  asset_id: string | null;
  created_at: string;
  error_message: string | null;
  file_size: number | null;
  filename: string | null;
  height: number | null;
  id: string;
  image_url: string | null;
  run_id: string;
  source_id: string | null;
  source_page_url: string | null;
  status: ImageCollectionItemStatus;
  storage_path: string | null;
  width: number | null;
};
