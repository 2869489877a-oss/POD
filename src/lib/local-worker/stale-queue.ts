import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type StaleQueueTable =
  | "asset_delete_jobs"
  | "ai_apply_pattern_jobs"
  | "ai_image_jobs"
  | "ai_split_grid_jobs"
  | "export_records";

type RecoverStaleRowsOptions = {
  defaultMinutes?: number;
  envName?: string;
  exportType?: "images_zip";
  limit?: number;
  minMinutes?: number;
  table: StaleQueueTable;
  update: Record<string, unknown>;
};

function staleCutoff({
  defaultMinutes = 60,
  envName = "LOCAL_WORKER_STALE_JOB_MINUTES",
  minMinutes = 15,
}: Pick<RecoverStaleRowsOptions, "defaultMinutes" | "envName" | "minMinutes">) {
  const minutes = Number(process.env[envName ?? "LOCAL_WORKER_STALE_JOB_MINUTES"] ?? defaultMinutes);
  const normalizedMinutes = Number.isFinite(minutes)
    ? Math.max(minMinutes ?? 15, Math.min(24 * 60, minutes))
    : defaultMinutes;

  return new Date(Date.now() - normalizedMinutes * 60 * 1000).toISOString();
}

export async function recoverStaleProcessingRows(
  supabase: SupabaseServiceClient,
  options: RecoverStaleRowsOptions,
) {
  const cutoff = staleCutoff(options);
  let query = supabase
    .from(options.table)
    .select("id")
    .eq("status", "processing")
    .lt("updated_at", cutoff);

  if (options.exportType) {
    query = query.eq("export_type", options.exportType);
  }

  const { data, error } = await query.limit(options.limit ?? 25);
  if (error) {
    return { error: error.message, recovered: 0 };
  }

  const ids = ((data ?? []) as Array<{ id?: unknown }>)
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length === 0) {
    return { recovered: 0 };
  }

  const { error: updateError } = await supabase
    .from(options.table)
    .update(options.update)
    .in("id", ids);

  if (updateError) {
    return { error: updateError.message, recovered: 0 };
  }

  return { recovered: ids.length };
}
