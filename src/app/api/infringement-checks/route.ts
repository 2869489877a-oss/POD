import { NextResponse } from "next/server";

import {
  mapDetectionStatusToAssetCopyrightStatus,
  runInfringementDetection,
} from "@/lib/infringement/detector";
import { computeAverageHashFromUrl } from "@/lib/infringement/image-hash";
import { archiveOldInfringementChecks } from "@/lib/maintenance/supabase-archive";
import { elapsedMs, logActivity } from "@/lib/observability/activity-log";
import {
  builtInHighRiskReferenceItems,
  normalizeReferenceRow,
} from "@/lib/infringement/reference-library";
import type {
  InfringementCheckStatus,
  InfringementDetectionResult,
  InfringementReferenceItem,
} from "@/lib/infringement/types";
import { extractTextFromImageUrl } from "@/lib/infringement/ocr";
import { createInfringementCheckJob } from "@/lib/infringement/worker-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

type AssetRow = {
  copyright_status: string;
  filename: string;
  id: string;
  ocr_checked_at: string | null;
  ocr_text: string | null;
  original_url: string;
  source: string;
};

type InfringementCheckInsertRow = {
  asset_id: string;
  confidence: number;
  status: InfringementCheckStatus;
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

type CreateChecksRequest = {
  asset_ids?: unknown;
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

const IN_QUERY_CHUNK_SIZE = 500;
const INSERT_CHUNK_SIZE = 500;
const REFERENCE_CACHE_TTL_MS = Math.max(0, Number(process.env.INFRINGEMENT_REFERENCE_CACHE_MS ?? 60_000) || 0);
const OCR_WORKER_COUNT = Math.max(1, Math.min(4, Number(process.env.INFRINGEMENT_OCR_CONCURRENCY ?? 3) || 3));
const HASH_WORKER_COUNT = Math.max(1, Math.min(8, Number(process.env.INFRINGEMENT_HASH_CONCURRENCY ?? 6) || 6));

let referenceItemsCache: { expiresAt: number; items: InfringementReferenceItem[] } | null = null;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function parseAssetIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("请选择至少一张素材");
  }

  const ids = Array.from(
    new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)),
  );

  if (ids.length === 0) {
    throw new Error("请选择至少一张素材");
  }

  return ids;
}

function arrayOrEmpty(value: string[] | null) {
  return Array.isArray(value) ? value : [];
}

async function fetchReferenceItems(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
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

async function computeAssetHashes(
  assets: AssetRow[],
  shouldComputeHashes: boolean,
) {
  if (!shouldComputeHashes) return new Map<string, string>();

  const pairs: Array<readonly [string, string | null]> = [];
  const queue = [...assets];

  async function worker() {
    for (;;) {
      const asset = queue.shift();
      if (!asset) return;

      try {
        pairs.push([asset.id, await computeAverageHashFromUrl(asset.original_url)] as const);
      } catch {
        pairs.push([asset.id, null] as const);
      }
    }
  }

  const workerCount = Math.min(HASH_WORKER_COUNT, Math.max(1, queue.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return new Map(pairs.filter((item): item is readonly [string, string] => Boolean(item[1])));
}

async function fetchAssetsWithOcr(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetIds: string[],
): Promise<{ assets: AssetRow[]; ocrColumnsAvailable: boolean }> {
  const chunks = chunkArray(assetIds, IN_QUERY_CHUNK_SIZE);
  const [firstChunk = []] = chunks;
  const withOcr = await supabase
    .from("assets")
    .select("id,filename,original_url,source,copyright_status,ocr_text,ocr_checked_at")
    .in("id", firstChunk);

  if (!withOcr.error) {
    const assets = [...((withOcr.data ?? []) as unknown as AssetRow[])];

    for (const ids of chunks.slice(1)) {
      const response = await supabase
        .from("assets")
        .select("id,filename,original_url,source,copyright_status,ocr_text,ocr_checked_at")
        .in("id", ids);

      if (response.error) {
        throw new Error(response.error.message);
      }

      assets.push(...((response.data ?? []) as unknown as AssetRow[]));
    }

    return { assets, ocrColumnsAvailable: true };
  }

  const message = (withOcr.error.message || "").toLowerCase();
  const missingColumn =
    withOcr.error.code === "42703" ||
    message.includes("ocr_text") ||
    message.includes("ocr_checked_at") ||
    message.includes("schema cache");

  if (!missingColumn) {
    throw new Error(withOcr.error.message);
  }

  // OCR columns not migrated yet → run text-only detection without crashing.
  const baseRows: Array<Omit<AssetRow, "ocr_checked_at" | "ocr_text">> = [];

  for (const ids of chunks) {
    const base = await supabase
      .from("assets")
      .select("id,filename,original_url,source,copyright_status")
      .in("id", ids);

    if (base.error) {
      throw new Error(base.error.message);
    }

    baseRows.push(...((base.data ?? []) as unknown as Array<Omit<AssetRow, "ocr_checked_at" | "ocr_text">>));
  }

  const assets = baseRows.map(
    (asset) => ({ ...asset, ocr_checked_at: null, ocr_text: null }),
  );

  return { assets, ocrColumnsAvailable: false };
}

async function fetchProductTexts(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetIds: string[],
) {
  const rows: ProductTextRow[] = [];

  for (const ids of chunkArray(assetIds, IN_QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("product_drafts")
      .select("asset_id,title,description,tags,bullet_points,sku,product_type")
      .in("asset_id", ids);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data ?? []) as unknown as ProductTextRow[]));
  }

  return rows;
}

async function insertInfringementChecks(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  rows: Array<Record<string, unknown>>,
) {
  const inserted: InfringementCheckInsertRow[] = [];

  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("infringement_checks")
      .insert(chunk)
      .select(checkColumns);

    if (error) {
      throw new Error(error.message);
    }

    inserted.push(...((data ?? []) as unknown as InfringementCheckInsertRow[]));
  }

  return inserted;
}

async function fetchAllChecks(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
) {
  const rows: unknown[] = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("infringement_checks")
      .select(checkColumns)
      .order("created_at", { ascending: false })
      .range(from, from + 999);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  return rows;
}

async function resolveOcrText(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assets: AssetRow[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const pending: AssetRow[] = [];

  for (const asset of assets) {
    if (asset.ocr_checked_at) {
      if (asset.ocr_text) resolved.set(asset.id, asset.ocr_text);
    } else {
      pending.push(asset);
    }
  }

  const queue = [...pending];

  async function worker() {
    for (;;) {
      const asset = queue.shift();
      if (!asset) return;

      const text = await extractTextFromImageUrl(asset.original_url);
      if (text === null) continue; // tesseract unavailable / failed → retry on a later run

      if (text) resolved.set(asset.id, text);
      // Best-effort cache; ignore write errors so detection still completes.
      await supabase
        .from("assets")
        .update({ ocr_checked_at: new Date().toISOString(), ocr_text: text || null })
        .eq("id", asset.id);
    }
  }

  const workerCount = Math.min(OCR_WORKER_COUNT, Math.max(1, queue.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return resolved;
}

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();

  try {
    const checks = await fetchAllChecks(supabase);
    return NextResponse.json({ checks });
  } catch (error) {
    return NextResponse.json(
      { checks: [], error: error instanceof Error ? error.message : "Failed to load infringement checks" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let body: CreateChecksRequest;

  try {
    body = (await request.json()) as CreateChecksRequest;
  } catch {
    return NextResponse.json({ error: "无法读取检测参数", results: [] }, { status: 400 });
  }

  try {
    const assetIds = parseAssetIds(body.asset_ids);
    const supabase = createSupabaseServiceRoleClient();

    if (process.env.INFRINGEMENT_CHECKS_SYNC !== "true") {
      try {
        const job = await createInfringementCheckJob(supabase, assetIds);

        await logActivity({
          action: "infringement.batch_check.queued",
          durationMs: elapsedMs(startedAt),
          entityType: "image_jobs",
          metadata: {
            asset_count: assetIds.length,
            job_id: (job as { id?: string }).id,
          },
          request,
          status: "success",
        });

        return NextResponse.json({
          job,
          job_id: (job as { id?: string }).id,
          message: `已提交 ${assetIds.length} 张素材到后台侵权检测队列`,
          queued: true,
          total: assetIds.length,
        });
      } catch (queueError) {
        if (process.env.INFRINGEMENT_CHECKS_REQUIRE_WORKER === "true") {
          throw queueError;
        }
        console.warn(
          `[infringement-checks] queue fallback to sync: ${
            queueError instanceof Error ? queueError.message : String(queueError)
          }`,
        );
      }
    }

    const [databaseReferenceItems, assetsWithOcr] = await Promise.all([
      fetchReferenceItems(supabase),
      fetchAssetsWithOcr(supabase, assetIds),
    ]);
    const { assets, ocrColumnsAvailable } = assetsWithOcr;

    if (assets.length !== assetIds.length) {
      throw new Error("部分素材不存在，请刷新后重试");
    }

    // OCR：读取图片里的文字喂给规则库；结果缓存到素材表，避免重复识别。
    // 未安装 tesseract 或未跑迁移时自动跳过（回退纯文字检测，不报错）。
    const shouldComputeHashes =
      databaseReferenceItems.some((item) => Boolean(item.imageHash)) ||
      builtInHighRiskReferenceItems.some((item) => Boolean(item.imageHash));
    const [ocrTextById, productData, assetHashesById] = await Promise.all([
      ocrColumnsAvailable ? resolveOcrText(supabase, assets) : Promise.resolve(new Map<string, string>()),
      fetchProductTexts(supabase, assetIds),
      computeAssetHashes(assets, shouldComputeHashes),
    ]);

    const productsByAssetId = new Map<string, ProductTextRow[]>();
    for (const product of productData) {
      const current = productsByAssetId.get(product.asset_id) ?? [];
      current.push(product);
      productsByAssetId.set(product.asset_id, current);
    }

    const resultsByAssetId = new Map<string, InfringementDetectionResult>();

    const insertRows = assets.map((asset) => {
      const result = runInfringementDetection({
        asset: {
          ...asset,
          image_hash: assetHashesById.get(asset.id) ?? null,
        },
        ocrText: ocrTextById.get(asset.id) ?? null,
        productTexts: (productsByAssetId.get(asset.id) ?? []).map((product) => ({
          bullet_points: arrayOrEmpty(product.bullet_points),
          description: product.description,
          product_type: product.product_type,
          sku: product.sku,
          tags: arrayOrEmpty(product.tags),
          title: product.title,
        })),
        referenceItems: databaseReferenceItems,
      });
      resultsByAssetId.set(asset.id, result);

      return {
        asset_id: asset.id,
        confidence: result.confidence,
        detection_source: "rule_engine",
        evidence: result.evidence,
        matched_rules: result.matched_rules,
        recommendation: result.recommendation,
        risk_level: result.risk_level,
        status: result.status,
      };
    });

    const insertedChecks = await insertInfringementChecks(supabase, insertRows);

    const insertedChecksByAssetId = new Map(insertedChecks.map((check) => [check.asset_id, check]));
    const assetUpdatesByStatus = new Map<string, string[]>();

    for (const asset of assets) {
      const check = insertedChecksByAssetId.get(asset.id);
      if (!check) continue;

      const nextCopyrightStatus = mapDetectionStatusToAssetCopyrightStatus(
        check.status,
        asset.copyright_status,
      );
      const result = resultsByAssetId.get(asset.id);
      const resolvedCopyrightStatus = result?.evidence.allowlist_matched
        ? "commercial_ok"
        : nextCopyrightStatus;

      if (resolvedCopyrightStatus === asset.copyright_status) continue;

      const ids = assetUpdatesByStatus.get(resolvedCopyrightStatus) ?? [];
      ids.push(asset.id);
      assetUpdatesByStatus.set(resolvedCopyrightStatus, ids);
    }

    await Promise.all(
      Array.from(assetUpdatesByStatus.entries()).map(([copyrightStatus, ids]) => (
        supabase
          .from("assets")
          .update({ copyright_status: copyrightStatus })
          .in("id", ids)
          .then(({ error }) => {
            if (error) throw new Error(error.message);
          })
      )),
    );

    const archivedChecks = await archiveOldInfringementChecks(supabase, assetIds);

    await logActivity({
      action: "infringement.batch_check",
      durationMs: elapsedMs(startedAt),
      entityType: "infringement_checks",
      metadata: {
        archived_checks: archivedChecks.archived,
        asset_count: assetIds.length,
        check_count: insertedChecks.length,
      },
      request,
      status: "success",
    });

    return NextResponse.json({
      checks: insertedChecks,
      message: `已完成 ${insertedChecks.length} 张素材的规则检测`,
    });
  } catch (error) {
    await logActivity({
      action: "infringement.batch_check",
      durationMs: elapsedMs(startedAt),
      message: error instanceof Error ? error.message : "Infringement check failed",
      request,
      status: "failure",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "侵权检测失败", results: [] },
      { status: 500 },
    );
  }
}
