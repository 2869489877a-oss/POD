import "server-only";

import {
  mapDetectionStatusToAssetCopyrightStatus,
} from "@/lib/infringement/detector";
import {
  builtInHighRiskReferenceItems,
  normalizeReferenceRow,
} from "@/lib/infringement/reference-library";
import type {
  InfringementCheckStatus,
  InfringementDetectionResult,
  InfringementReferenceItem,
} from "@/lib/infringement/types";
import { archiveOldImageJobItems, archiveOldInfringementChecks } from "@/lib/maintenance/supabase-archive";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { updateJobCounts } from "@/lib/local-worker/image-jobs";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type AssetRow = {
  copyright_status: string;
  filename: string;
  id: string;
  ocr_checked_at?: string | null;
  ocr_text?: string | null;
  original_url: string;
  source: string;
};

type ImageJobRow = {
  id: string;
  job_type: string;
  status: string;
};

type WorkerItemRow = {
  asset_id: string;
  assets: AssetRow | AssetRow[] | null;
  id: string;
  image_jobs: ImageJobRow | ImageJobRow[] | null;
  input_url: string;
  job_id: string;
};

type ProductTextRow = {
  asset_id: string;
  bullet_points: string[] | null;
  description: string | null;
  product_type: string | null;
  sku: string | null;
  tags: string[] | null;
  title: string | null;
};

type ReferenceRow = {
  category: string | null;
  description: string | null;
  id: string;
  image_hash: string | null;
  image_url: string | null;
  is_active: boolean | null;
  library_type: string | null;
  notes: string | null;
  risk_level: string | null;
  severity: string | null;
  source_label: string | null;
  source_url: string | null;
  terms: string[] | null;
  title: string | null;
};

export type InfringementWorkerCompleteInput = {
  image_hash?: string | null;
  ocr_attempted?: boolean;
  ocr_text?: string | null;
  result: InfringementDetectionResult;
};

const checkColumns = [
  "id",
  "asset_id",
  "status",
  "risk_level",
  "confidence",
  "detection_source",
  "matched_rules",
  "evidence",
  "recommendation",
  "reviewer_note",
  "reviewed_at",
  "created_at",
  "updated_at",
].join(",");

const REFERENCE_CACHE_TTL_MS = Math.max(0, Number(process.env.INFRINGEMENT_REFERENCE_CACHE_MS ?? 60_000) || 0);
let referenceItemsCache: { expiresAt: number; items: InfringementReferenceItem[] } | null = null;

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function arrayOrEmpty(value: string[] | null) {
  return Array.isArray(value) ? value : [];
}

export async function fetchDatabaseReferenceItems(
  supabase: SupabaseServiceClient,
): Promise<InfringementReferenceItem[]> {
  if (REFERENCE_CACHE_TTL_MS > 0 && referenceItemsCache && referenceItemsCache.expiresAt > Date.now()) {
    return referenceItemsCache.items;
  }

  const { data, error } = await supabase
    .from("infringement_reference_items")
    .select("id,library_type,category,title,terms,image_url,image_hash,risk_level,severity,description,source_label,source_url,notes,is_active")
    .eq("is_active", true)
    .limit(5000);

  if (error) {
    const message = error.message.toLowerCase();
    if (error.code === "42P01" || message.includes("infringement_reference_items")) {
      return [];
    }

    throw new Error(error.message);
  }

  const items = ((data ?? []) as unknown as ReferenceRow[]).map(normalizeReferenceRow);

  if (REFERENCE_CACHE_TTL_MS > 0) {
    referenceItemsCache = {
      expiresAt: Date.now() + REFERENCE_CACHE_TTL_MS,
      items,
    };
  }

  return items;
}

async function getWorkerItem(supabase: SupabaseServiceClient, itemId: string) {
  const { data, error } = await supabase
    .from("image_job_items")
    .select(
      [
        "id",
        "job_id",
        "asset_id",
        "input_url",
        "image_jobs!inner(id,job_type,status)",
        "assets!inner(id,filename,original_url,source,copyright_status,ocr_text,ocr_checked_at)",
      ].join(","),
    )
    .eq("id", itemId)
    .single();

  if (error) {
    throw new Error(`读取侵权检测 worker 子任务失败：${error.message}`);
  }

  const row = data as unknown as WorkerItemRow;
  const job = asSingle(row.image_jobs);
  const asset = asSingle(row.assets);

  if (!job || !asset) {
    throw new Error("侵权检测 worker 子任务缺少任务或素材记录");
  }
  if (job.job_type !== "infringement_check") {
    throw new Error(`当前子任务不是侵权检测任务：${job.job_type}`);
  }

  return { asset, item: row, job };
}

export async function createInfringementCheckJob(
  supabase: SupabaseServiceClient,
  assetIds: string[],
) {
  const uniqueAssetIds = Array.from(new Set(assetIds));
  const { data: assetData, error: assetError } = await supabase
    .from("assets")
    .select("id,filename,original_url")
    .in("id", uniqueAssetIds);

  if (assetError) {
    throw new Error(`读取素材失败：${assetError.message}`);
  }

  const assets = (assetData ?? []) as Array<{ filename: string; id: string; original_url: string }>;
  if (assets.length !== uniqueAssetIds.length) {
    throw new Error("部分素材不存在，请刷新后重试");
  }

  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .insert({
      failed_count: 0,
      job_type: "infringement_check",
      options: {
        execution: "local_worker",
        mode: "rule_engine",
        processing_kind: "infringement_check",
      },
      status: "pending",
      success_count: 0,
      total_count: assets.length,
    })
    .select("id,job_type,status,total_count,success_count,failed_count")
    .single();

  if (jobError) {
    throw new Error(`侵权检测 worker 任务创建失败：${jobError.message}`);
  }

  const jobId = (jobData as unknown as { id: string }).id;
  const { error: itemError } = await supabase.from("image_job_items").insert(
    assets.map((asset) => ({
      asset_id: asset.id,
      input_url: asset.original_url,
      job_id: jobId,
      status: "pending",
    })),
  );

  if (itemError) {
    await supabase
      .from("image_jobs")
      .update({
        error_message: itemError.message,
        failed_count: assets.length,
        status: "failed",
      })
      .eq("id", jobId);
    throw new Error(`侵权检测 worker 子任务创建失败：${itemError.message}`);
  }

  return jobData;
}

export async function getInfringementWorkerPayload(supabase: SupabaseServiceClient, itemId: string) {
  const [{ asset, item, job }, referenceItems] = await Promise.all([
    getWorkerItem(supabase, itemId),
    fetchDatabaseReferenceItems(supabase),
  ]);
  const { data: productData, error: productError } = await supabase
    .from("product_drafts")
    .select("asset_id,title,description,tags,bullet_points,sku,product_type")
    .eq("asset_id", asset.id);

  if (productError) {
    throw new Error(`读取商品文案失败：${productError.message}`);
  }

  return {
    asset: {
      copyright_status: asset.copyright_status,
      filename: asset.filename,
      id: asset.id,
      ocr_checked_at: asset.ocr_checked_at ?? null,
      ocr_text: asset.ocr_text ?? null,
      original_url: asset.original_url,
      source: asset.source,
    },
    input_url: item.input_url,
    item_id: item.id,
    job_id: job.id,
    product_texts: ((productData ?? []) as unknown as ProductTextRow[]).map((product) => ({
      bullet_points: arrayOrEmpty(product.bullet_points),
      description: product.description,
      product_type: product.product_type,
      sku: product.sku,
      tags: arrayOrEmpty(product.tags),
      title: product.title,
    })),
    reference_items: referenceItems,
    should_compute_hash:
      referenceItems.some((item) => Boolean(item.imageHash)) ||
      builtInHighRiskReferenceItems.some((item) => Boolean(item.imageHash)),
  };
}

export async function completeInfringementWorkerItem(
  supabase: SupabaseServiceClient,
  itemId: string,
  input: InfringementWorkerCompleteInput,
) {
  const { asset, item } = await getWorkerItem(supabase, itemId);
  const result = input.result;

  if (!result || typeof result !== "object") {
    throw new Error("侵权检测结果为空");
  }

  if (input.ocr_attempted && typeof input.ocr_text === "string") {
    await supabase
      .from("assets")
      .update({
        ocr_checked_at: new Date().toISOString(),
        ocr_text: input.ocr_text.trim() || null,
      })
      .eq("id", asset.id);
  }

  const { data: checkData, error: checkError } = await supabase
    .from("infringement_checks")
    .insert({
      asset_id: asset.id,
      confidence: result.confidence,
      detection_source: "rule_engine",
      evidence: {
        ...result.evidence,
        execution: "local_worker",
        worker_job_id: item.job_id,
        worker_job_item_id: item.id,
      },
      matched_rules: result.matched_rules,
      recommendation: result.recommendation,
      risk_level: result.risk_level,
      status: result.status,
    })
    .select(checkColumns)
    .single();

  if (checkError) {
    throw new Error(`侵权检测结果保存失败：${checkError.message}`);
  }

  const insertedCheck = checkData as unknown as { asset_id: string; confidence: number; status: InfringementCheckStatus };
  const nextCopyrightStatus = mapDetectionStatusToAssetCopyrightStatus(
    insertedCheck.status,
    asset.copyright_status,
  );
  const resolvedCopyrightStatus = result.evidence.allowlist_matched
    ? "commercial_ok"
    : nextCopyrightStatus;

  if (resolvedCopyrightStatus !== asset.copyright_status) {
    const { error: assetUpdateError } = await supabase
      .from("assets")
      .update({ copyright_status: resolvedCopyrightStatus })
      .eq("id", asset.id);

    if (assetUpdateError) {
      throw new Error(`素材版权状态更新失败：${assetUpdateError.message}`);
    }
  }

  const { error: itemUpdateError } = await supabase
    .from("image_job_items")
    .update({
      error_message: null,
      output_url: asset.original_url,
      status: "completed",
    })
    .eq("id", item.id);

  if (itemUpdateError) {
    throw new Error(`侵权检测子任务更新失败：${itemUpdateError.message}`);
  }

  const jobCounts = await updateJobCounts(supabase, item.job_id);
  if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
    const { data: jobItemData } = await supabase
      .from("image_job_items")
      .select("asset_id")
      .eq("job_id", item.job_id);
    const jobAssetIds = Array.from(
      new Set(((jobItemData ?? []) as Array<{ asset_id?: string }>).map((row) => row.asset_id).filter(Boolean)),
    ) as string[];

    await Promise.all([
      archiveOldImageJobItems(supabase),
      archiveOldInfringementChecks(supabase, jobAssetIds.length > 0 ? jobAssetIds : [asset.id]),
    ]);
  }

  return {
    check: insertedCheck,
    job: jobCounts,
  };
}
