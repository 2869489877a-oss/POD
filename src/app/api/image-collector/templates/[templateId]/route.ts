import { NextResponse } from "next/server";

import { calculateNextRunAt, parseCronExpression } from "@/lib/image-collector/schedule";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type {
  ImageCollectionSource,
  ImageCollectionSourceInput,
  ImageCollectionTemplate,
  ImageCollectionTemplateInput,
} from "@/types/image-collector";

export const runtime = "nodejs";

type TemplateRow = Omit<ImageCollectionTemplate, "keywords" | "sources"> & {
  keywords: unknown;
};

type SourceRow = Omit<ImageCollectionSource, "options"> & {
  options: unknown;
};

type TemplateRequest = {
  cron_expression?: unknown;
  keywords?: unknown;
  main_folder_name?: unknown;
  max_images?: unknown;
  name?: unknown;
  schedule_enabled?: unknown;
  sources?: unknown;
  storage_prefix?: unknown;
};

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
  "created_at",
  "updated_at",
].join(",");

const sourceColumns = [
  "id",
  "template_id",
  "site_name",
  "start_url",
  "folder_name",
  "enabled",
  "options",
  "created_at",
  "updated_at",
].join(",");

function getTemplateId(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const templateIndex = parts.lastIndexOf("templates") + 1;
  return decodeURIComponent(parts[templateIndex] ?? "");
}

function textField(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`请填写${fieldName}`);
  }

  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStoragePrefix(value: unknown) {
  const prefix = typeof value === "string" && value.trim().length > 0 ? value.trim() : "collections";
  const normalized = prefix.replace(/^\/+|\/+$/g, "");

  if (
    normalized.length === 0 ||
    normalized.includes("..") ||
    normalized.includes("\\") ||
    normalized.includes(":")
  ) {
    throw new Error("上层目录逻辑路径只能使用 Supabase Storage 的相对前缀");
  }

  return normalized;
}

function normalizeFolderName(value: unknown, fieldName: string) {
  const folderName = textField(value, fieldName);

  if (folderName.includes("/") || folderName.includes("\\") || folderName.includes("..")) {
    throw new Error(`${fieldName}不能包含路径分隔符`);
  }

  return folderName;
}

function normalizeKeywords(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  throw new Error("关键词必须是字符串数组或逗号分隔文本");
}

function normalizeMaxImages(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 50);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error("下载数量必须是 1 到 500 之间的整数");
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateHttpUrl(value: string, fieldName: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error();
    }
  } catch {
    throw new Error(`${fieldName}必须是 http 或 https URL`);
  }
}

function normalizeSources(value: unknown): ImageCollectionSourceInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((source, index) => {
    if (!isRecord(source)) {
      throw new Error(`第 ${index + 1} 个网站来源配置无效`);
    }

    const startUrl = textField(source.start_url, "起始页面 URL");
    validateHttpUrl(startUrl, "起始页面 URL");

    return {
      enabled: source.enabled !== false,
      folder_name: normalizeFolderName(source.folder_name, "文件夹名称"),
      options: isRecord(source.options) ? source.options : {},
      site_name: textField(source.site_name, "网站名称"),
      start_url: startUrl,
    };
  });
}

function parseTemplateInput(body: TemplateRequest): ImageCollectionTemplateInput {
  const scheduleEnabled = body.schedule_enabled === true;
  const cronExpression = optionalText(body.cron_expression) ?? (scheduleEnabled ? "hourly" : "manual");

  if (scheduleEnabled) {
    parseCronExpression(cronExpression);
  }

  return {
    cron_expression: cronExpression,
    keywords: normalizeKeywords(body.keywords),
    main_folder_name: normalizeFolderName(body.main_folder_name, "主文件夹名称"),
    max_images: normalizeMaxImages(body.max_images),
    name: textField(body.name, "模板名称"),
    schedule_enabled: scheduleEnabled,
    sources: normalizeSources(body.sources),
    storage_prefix: normalizeStoragePrefix(body.storage_prefix),
  };
}

function toKeywords(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toOptions(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeTemplate(row: TemplateRow, sources: SourceRow[]): ImageCollectionTemplate {
  return {
    ...row,
    keywords: toKeywords(row.keywords),
    sources: sources.map((source) => ({
      ...source,
      options: toOptions(source.options),
    })),
  };
}

async function getTemplateWithSources(templateId: string) {
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
    return null;
  }

  const { data: sourceData, error: sourceError } = await supabase
    .from("image_collection_sources")
    .select(sourceColumns)
    .eq("template_id", templateId)
    .order("created_at", { ascending: true });

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  return normalizeTemplate(
    templateData as unknown as TemplateRow,
    (sourceData ?? []) as unknown as SourceRow[],
  );
}

export async function GET(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少采集模板 ID" }, { status: 400 });
  }

  try {
    const template = await getTemplateWithSources(templateId);

    if (!template) {
      return NextResponse.json({ error: "采集模板不存在" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取采集模板失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少采集模板 ID" }, { status: 400 });
  }

  let body: TemplateRequest;

  try {
    body = (await request.json()) as TemplateRequest;
  } catch {
    return NextResponse.json({ error: "无法读取采集模板参数" }, { status: 400 });
  }

  let input: ImageCollectionTemplateInput;

  try {
    input = parseTemplateInput(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "采集模板参数无效" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    const nextRunAt = calculateNextRunAt(
      {
        cron_expression: input.cron_expression,
        last_run_at: null,
        next_run_at: null,
        schedule_enabled: input.schedule_enabled,
        status: "active",
      },
      new Date(),
    );
    const { error: templateError } = await supabase
      .from("image_collection_templates")
      .update({
        cron_expression: input.cron_expression,
        keywords: input.keywords,
        main_folder_name: input.main_folder_name,
        max_images: input.max_images,
        name: input.name,
        next_run_at: nextRunAt,
        schedule_enabled: input.schedule_enabled,
        storage_prefix: input.storage_prefix,
      })
      .eq("id", templateId);

    if (templateError) {
      throw new Error(templateError.message);
    }

    const { error: deleteSourcesError } = await supabase
      .from("image_collection_sources")
      .delete()
      .eq("template_id", templateId);

    if (deleteSourcesError) {
      throw new Error(deleteSourcesError.message);
    }

    if (input.sources.length > 0) {
      const { error: sourceError } = await supabase.from("image_collection_sources").insert(
        input.sources.map((source) => ({
          enabled: source.enabled,
          folder_name: source.folder_name,
          options: source.options ?? {},
          site_name: source.site_name,
          start_url: source.start_url,
          template_id: templateId,
        })),
      );

      if (sourceError) {
        throw new Error(sourceError.message);
      }
    }

    const template = await getTemplateWithSources(templateId);

    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存采集模板失败" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少采集模板 ID" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("image_collection_templates")
    .update({ status: "archived" })
    .eq("id", templateId)
    .select(templateColumns)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template: data });
}
