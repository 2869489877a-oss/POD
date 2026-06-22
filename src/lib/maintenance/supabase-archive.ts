import "server-only";

import { appendLocalJsonlRows, localDatePath } from "@/lib/storage/local-data";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_ARCHIVE_INTERVAL_MS = Math.max(
  0,
  Number(process.env.SUPABASE_ARCHIVE_INTERVAL_MS ?? 5 * 60_000) || 0,
);

let lastImageJobItemsArchiveAt = 0;

function retentionDays(envName: string, fallback: number) {
  const value = Number(process.env[envName] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function archivePath(table: string, date = new Date()) {
  return `archive/${table}/${localDatePath(date)}.jsonl`;
}

async function archiveRows(table: string, rows: unknown[]) {
  if (rows.length === 0) return;
  const archivedAt = new Date().toISOString();
  await appendLocalJsonlRows(
    archivePath(table),
    rows.map((row) => ({
      archived_at: archivedAt,
      table,
      row,
    })),
  );
}

export async function archiveOldInfringementChecks(
  supabase: SupabaseServiceClient,
  assetIds: string[],
) {
  const days = retentionDays("INFRINGEMENT_CHECK_RETENTION_DAYS", 90);
  if (days <= 0 || assetIds.length === 0) return { archived: 0 };

  const cutoff = cutoffIso(days);
  const { data, error } = await supabase
    .from("infringement_checks")
    .select("*")
    .in("asset_id", Array.from(new Set(assetIds)))
    .lt("created_at", cutoff)
    .limit(DEFAULT_BATCH_SIZE);

  if (error || !data?.length) {
    return { archived: 0, error: error?.message };
  }

  try {
    await archiveRows("infringement_checks", data);
  } catch (archiveError) {
    return { archived: 0, error: getErrorMessage(archiveError) };
  }

  const ids = (data as Array<{ id: string }>).map((row) => row.id).filter(Boolean);
  const deleteResult = await supabase.from("infringement_checks").delete().in("id", ids);

  if (deleteResult.error) {
    return { archived: 0, error: deleteResult.error.message };
  }

  return { archived: ids.length };
}

export async function archiveOldImageJobItems(
  supabase: SupabaseServiceClient,
  options: { force?: boolean } = {},
) {
  const now = Date.now();
  if (!options.force && DEFAULT_ARCHIVE_INTERVAL_MS > 0 && now - lastImageJobItemsArchiveAt < DEFAULT_ARCHIVE_INTERVAL_MS) {
    return { archived: 0, skipped: true };
  }
  lastImageJobItemsArchiveAt = now;

  const days = retentionDays("IMAGE_JOB_ITEM_RETENTION_DAYS", 90);
  if (days <= 0) return { archived: 0 };

  const cutoff = cutoffIso(days);
  const { data, error } = await supabase
    .from("image_job_items")
    .select("*")
    .in("status", ["completed", "failed"])
    .lt("created_at", cutoff)
    .limit(DEFAULT_BATCH_SIZE);

  if (error || !data?.length) {
    return { archived: 0, error: error?.message };
  }

  try {
    await archiveRows("image_job_items", data);
  } catch (archiveError) {
    return { archived: 0, error: getErrorMessage(archiveError) };
  }

  const ids = (data as Array<{ id: string }>).map((row) => row.id).filter(Boolean);
  const deleteResult = await supabase.from("image_job_items").delete().in("id", ids);

  if (deleteResult.error) {
    return { archived: 0, error: deleteResult.error.message };
  }

  return { archived: ids.length };
}
