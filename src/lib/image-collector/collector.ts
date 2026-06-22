import "server-only";

import sharp from "sharp";

import { downloadPublicHtml, downloadPublicImage } from "@/lib/image-collector/downloader";
import { extractImageUrlsFromHtml } from "@/lib/image-collector/html";
import { calculateNextRunAt } from "@/lib/image-collector/schedule";
import { uploadCollectedImage } from "@/lib/image-collector/storage";
import type {
  CollectedImageResult,
  CollectionCandidate,
  ImageCollectionItemWithPreview,
  ImageCollectionRunDetail,
  ImageCollectionSourceRow,
  ImageCollectionTemplateRow,
} from "@/lib/image-collector/types";
import {
  buildRootFolderName,
  normalizeUrl,
  safeFilenameFromUrl,
  safePathSegment,
} from "@/lib/image-collector/url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deleteLocalAssetByPublicUrl } from "@/lib/storage/local-assets";
import type { ImageCollectionItem, ImageCollectionRun } from "@/types/image-collector";

const MAX_CONCURRENT_DOWNLOADS = 3;

const templateColumns = [
  "id",
  "name",
  "main_folder_name",
  "storage_prefix",
  "keywords",
  "max_images",
  "schedule_enabled",
  "cron_expression",
  "last_run_at",
  "next_run_at",
  "status",
].join(",");

const sourceColumns = [
  "id",
  "template_id",
  "site_name",
  "start_url",
  "folder_name",
  "enabled",
].join(",");

const runColumns = [
  "id",
  "template_id",
  "run_type",
  "root_folder",
  "status",
  "total_found",
  "total_downloaded",
  "total_failed",
  "error_message",
  "started_at",
  "completed_at",
  "created_at",
].join(",");

const itemColumns = [
  "id",
  "run_id",
  "source_id",
  "asset_id",
  "source_page_url",
  "image_url",
  "storage_path",
  "filename",
  "status",
  "error_message",
  "width",
  "height",
  "file_size",
  "created_at",
].join(",");

type AssetPreviewRow = {
  id: string;
  original_url: string;
};

type SourceNameRow = {
  folder_name: string;
  id: string;
  site_name: string;
};

type TemplateNameRow = {
  id: string;
  name: string;
};

function getKeywords(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function normalizeStorageRoot(storagePrefix: string, rootFolderName: string) {
  const prefix = storagePrefix.replace(/^\/+|\/+$/g, "") || "collections";
  return `${prefix}/${rootFolderName}`;
}

function createPageUrls(source: ImageCollectionSourceRow, keywords: string[]) {
  if (!source.start_url.includes("{{keyword}}")) {
    const normalized = normalizeUrl(source.start_url, source.start_url);
    return normalized ? [normalized] : [];
  }

  if (keywords.length === 0) {
    throw new Error("URL 包含 {{keyword}}，但模板未配置关键词");
  }

  return keywords
    .map((keyword) => source.start_url.replaceAll("{{keyword}}", encodeURIComponent(keyword)))
    .map((url) => normalizeUrl(url, url))
    .filter((url): url is string => Boolean(url));
}

async function createFailedItem(input: {
  errorMessage: string;
  imageUrl?: string | null;
  runId: string;
  source: ImageCollectionSourceRow;
  sourcePageUrl: string;
}) {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("image_collection_items").insert({
    error_message: input.errorMessage,
    filename: input.imageUrl ? safeFilenameFromUrl(input.imageUrl) : null,
    image_url: input.imageUrl ?? null,
    run_id: input.runId,
    source_id: input.source.id,
    source_page_url: input.sourcePageUrl,
    status: "failed",
  });
}

async function insertDownloadedItem(input: {
  assetId: string;
  fileSize: number;
  filename: string;
  height: number;
  imageUrl: string;
  runId: string;
  source: ImageCollectionSourceRow;
  sourcePageUrl: string;
  storagePath: string;
  width: number;
}) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("image_collection_items").insert({
    asset_id: input.assetId,
    file_size: input.fileSize,
    filename: input.filename,
    height: input.height,
    image_url: input.imageUrl,
    run_id: input.runId,
    source_id: input.source.id,
    source_page_url: input.sourcePageUrl,
    status: "downloaded",
    storage_path: input.storagePath,
    width: input.width,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function collectSingleImage(
  runId: string,
  rootFolder: string,
  candidate: CollectionCandidate,
): Promise<CollectedImageResult> {
  const filename = safeFilenameFromUrl(candidate.imageUrl);

  try {
    const downloaded = await downloadPublicImage(candidate.imageUrl);
    const metadata = await sharp(downloaded.buffer).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error("无法读取图片宽高或格式");
    }

    const uploaded = await uploadCollectedImage({
      buffer: downloaded.buffer,
      contentType: downloaded.contentType,
      filename,
      rootFolder,
      sourceFolder: candidate.source.folder_name,
    });
    const supabase = createSupabaseServiceRoleClient();
    const { data: assetData, error: assetError } = await supabase
      .from("assets")
      .insert({
        copyright_status: "unknown",
        file_size: downloaded.fileSize,
        filename,
        format: metadata.format,
        height: metadata.height,
        original_url: uploaded.publicUrl,
        source: "link",
        status: "uploaded",
        width: metadata.width,
      })
      .select("id")
      .single();

    if (assetError) {
      await deleteLocalAssetByPublicUrl(uploaded.publicUrl);
      throw new Error(`assets 写入失败：${assetError.message}`);
    }

    const assetId = (assetData as unknown as { id: string }).id;
    await insertDownloadedItem({
      assetId,
      fileSize: downloaded.fileSize,
      filename,
      height: metadata.height,
      imageUrl: candidate.imageUrl,
      runId,
      source: candidate.source,
      sourcePageUrl: candidate.sourcePageUrl,
      storagePath: uploaded.storagePath,
      width: metadata.width,
    });

    return {
      assetId,
      errorMessage: null,
      filename,
      imageUrl: candidate.imageUrl,
      sourceId: candidate.source.id,
      sourcePageUrl: candidate.sourcePageUrl,
      status: "downloaded",
      storagePath: uploaded.storagePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "图片采集失败";
    await createFailedItem({
      errorMessage,
      imageUrl: candidate.imageUrl,
      runId,
      source: candidate.source,
      sourcePageUrl: candidate.sourcePageUrl,
    });

    return {
      assetId: null,
      errorMessage,
      filename,
      imageUrl: candidate.imageUrl,
      sourceId: candidate.source.id,
      sourcePageUrl: candidate.sourcePageUrl,
      status: "failed",
      storagePath: null,
    };
  }
}

async function collectWithConcurrency(
  candidates: CollectionCandidate[],
  runId: string,
  rootFolder: string,
) {
  const results: CollectedImageResult[] = [];

  for (let index = 0; index < candidates.length; index += MAX_CONCURRENT_DOWNLOADS) {
    const chunk = candidates.slice(index, index + MAX_CONCURRENT_DOWNLOADS);
    const chunkResults = await Promise.all(
      chunk.map((candidate) => collectSingleImage(runId, rootFolder, candidate)),
    );

    results.push(...chunkResults);
  }

  return results;
}

async function buildCandidates(input: {
  keywords: string[];
  maxImages: number;
  runId: string;
  sources: ImageCollectionSourceRow[];
}) {
  const candidates: CollectionCandidate[] = [];
  let totalFound = 0;
  let sourceFailureCount = 0;

  for (const source of input.sources) {
    if (candidates.length >= input.maxImages) {
      break;
    }

    let pageUrls: string[];

    try {
      pageUrls = createPageUrls(source, input.keywords);
    } catch (error) {
      sourceFailureCount += 1;
      await createFailedItem({
        errorMessage: error instanceof Error ? error.message : "生成采集 URL 失败",
        runId: input.runId,
        source,
        sourcePageUrl: source.start_url,
      });
      continue;
    }

    for (const pageUrl of pageUrls) {
      if (candidates.length >= input.maxImages) {
        break;
      }

      try {
        const html = await downloadPublicHtml(pageUrl);
        const imageUrls = extractImageUrlsFromHtml(html, pageUrl);
        totalFound += imageUrls.length;
        const remaining = input.maxImages - candidates.length;

        candidates.push(
          ...imageUrls.slice(0, remaining).map((imageUrl) => ({
            imageUrl,
            source,
            sourcePageUrl: pageUrl,
          })),
        );
      } catch (error) {
        sourceFailureCount += 1;
        await createFailedItem({
          errorMessage: error instanceof Error ? error.message : "页面采集失败",
          runId: input.runId,
          source,
          sourcePageUrl: pageUrl,
        });
      }
    }
  }

  return {
    candidates,
    sourceFailureCount,
    totalFound,
  };
}

export async function getImageCollectionRunDetail(runId: string): Promise<ImageCollectionRunDetail | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: runData, error: runError } = await supabase
    .from("image_collection_runs")
    .select(runColumns)
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    throw new Error(runError.message);
  }

  if (!runData) {
    return null;
  }

  const run = runData as unknown as ImageCollectionRun;
  const { data: itemData, error: itemError } = await supabase
    .from("image_collection_items")
    .select(itemColumns)
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  const items = (itemData ?? []) as unknown as ImageCollectionItem[];
  const assetIds = Array.from(
    new Set(items.map((item) => item.asset_id).filter((id): id is string => Boolean(id))),
  );
  const sourceIds = Array.from(
    new Set(items.map((item) => item.source_id).filter((id): id is string => Boolean(id))),
  );
  let assetsById = new Map<string, AssetPreviewRow>();
  let sourcesById = new Map<string, SourceNameRow>();

  if (assetIds.length > 0) {
    const { data: assetData, error: assetError } = await supabase
      .from("assets")
      .select("id,original_url")
      .in("id", assetIds);

    if (assetError) {
      throw new Error(assetError.message);
    }

    assetsById = new Map(
      ((assetData ?? []) as unknown as AssetPreviewRow[]).map((asset) => [asset.id, asset]),
    );
  }

  if (sourceIds.length > 0) {
    const { data: sourceData, error: sourceError } = await supabase
      .from("image_collection_sources")
      .select("id,site_name,folder_name")
      .in("id", sourceIds);

    if (sourceError) {
      throw new Error(sourceError.message);
    }

    sourcesById = new Map(
      ((sourceData ?? []) as unknown as SourceNameRow[]).map((source) => [source.id, source]),
    );
  }

  let templateName: string | null = null;

  if (run.template_id) {
    const { data: templateData, error: templateError } = await supabase
      .from("image_collection_templates")
      .select("id,name")
      .eq("id", run.template_id)
      .maybeSingle();

    if (templateError) {
      throw new Error(templateError.message);
    }

    templateName = (templateData as unknown as TemplateNameRow | null)?.name ?? null;
  }

  return {
    ...run,
    items: items.map((item): ImageCollectionItemWithPreview => {
      const asset = item.asset_id ? assetsById.get(item.asset_id) : null;
      const source = item.source_id ? sourcesById.get(item.source_id) : null;

      return {
        ...item,
        asset_original_url: asset?.original_url ?? null,
        source_folder_name: source?.folder_name ?? null,
        source_site_name: source?.site_name ?? null,
      };
    }),
    template_name: templateName,
  };
}

export async function runImageCollectionTemplate(
  templateId: string,
  runType: "manual" | "scheduled" = "manual",
) {
  const supabase = createSupabaseServiceRoleClient();
  const { data: templateData, error: templateError } = await supabase
    .from("image_collection_templates")
    .select(templateColumns)
    .eq("id", templateId)
    .maybeSingle();

  if (templateError) {
    throw new Error(templateError.message);
  }

  if (!templateData) {
    throw new Error("采集模板不存在");
  }

  const template = templateData as unknown as ImageCollectionTemplateRow;

  if (template.status !== "active") {
    throw new Error("采集模板已归档，不能运行");
  }

  const { data: sourceData, error: sourceError } = await supabase
    .from("image_collection_sources")
    .select(sourceColumns)
    .eq("template_id", template.id)
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const sources = (sourceData ?? []) as unknown as ImageCollectionSourceRow[];
  const rootFolderName = buildRootFolderName(template.main_folder_name);
  const rootFolder = normalizeStorageRoot(template.storage_prefix, rootFolderName);
  const now = new Date().toISOString();
  const { data: runData, error: runError } = await supabase
    .from("image_collection_runs")
    .insert({
      root_folder: rootFolder,
      run_type: runType,
      started_at: now,
      status: "processing",
      template_id: template.id,
    })
    .select("id")
    .single();

  if (runError) {
    throw new Error(runError.message);
  }

  const runId = (runData as unknown as { id: string }).id;
  let totalFound = 0;
  let sourceFailureCount = 0;
  let downloadedCount = 0;
  let failedImageCount = 0;
  let finalError: string | null = null;

  try {
    if (sources.length === 0) {
      finalError = "没有启用的网站来源";
    } else {
      const candidateResult = await buildCandidates({
        keywords: getKeywords(template.keywords),
        maxImages: template.max_images,
        runId,
        sources: sources.map((source) => ({
          ...source,
          folder_name: safePathSegment(source.folder_name, "source"),
        })),
      });
      totalFound = candidateResult.totalFound;
      sourceFailureCount = candidateResult.sourceFailureCount;

      const results = await collectWithConcurrency(candidateResult.candidates, runId, rootFolder);
      downloadedCount = results.filter((result) => result.status === "downloaded").length;
      failedImageCount = results.filter((result) => result.status === "failed").length;

      if (totalFound === 0 && sourceFailureCount === 0) {
        finalError = "未发现可采集图片";
      }
    }
  } catch (error) {
    finalError = error instanceof Error ? error.message : "采集执行失败";
  }

  const totalFailed = sourceFailureCount + failedImageCount;
  const status =
    downloadedCount > 0 && totalFailed > 0
      ? "partial_failed"
      : downloadedCount > 0
        ? "completed"
        : "failed";
  const completedAt = new Date().toISOString();
  const errorMessage =
    finalError ??
    (status === "partial_failed" ? "部分图片采集失败，请查看失败原因" : null);
  const { error: updateError } = await supabase
    .from("image_collection_runs")
    .update({
      completed_at: completedAt,
      error_message: errorMessage,
      status,
      total_downloaded: downloadedCount,
      total_failed: totalFailed,
      total_found: totalFound,
    })
    .eq("id", runId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const nextRunAt = calculateNextRunAt(
    {
      cron_expression: template.cron_expression,
      last_run_at: completedAt,
      next_run_at: template.next_run_at,
      schedule_enabled: template.schedule_enabled,
      status: template.status,
    },
    new Date(completedAt),
  );

  const { error: templateUpdateError } = await supabase
    .from("image_collection_templates")
    .update({
      last_run_at: completedAt,
      next_run_at: nextRunAt,
    })
    .eq("id", template.id);

  if (templateUpdateError) {
    throw new Error(templateUpdateError.message);
  }

  const detail = await getImageCollectionRunDetail(runId);

  if (!detail) {
    throw new Error("采集运行记录不存在");
  }

  return detail;
}
