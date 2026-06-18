import { NextResponse } from "next/server";

import { computeAverageHashFromUrl } from "@/lib/infringement/image-hash";
import {
  builtInHighRiskReferenceItems,
  builtInReferenceStats,
  normalizeReferenceRow,
} from "@/lib/infringement/reference-library";
import type {
  InfringementReferenceItem,
  InfringementReferenceLibraryType,
  InfringementRiskLevel,
  InfringementRuleCategory,
  InfringementSeverity,
} from "@/lib/infringement/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

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

type CreateReferenceRequest = {
  action?: unknown;
  category?: unknown;
  description?: unknown;
  image_url?: unknown;
  image_urls?: unknown;
  library_type?: unknown;
  notes?: unknown;
  risk_level?: unknown;
  severity?: unknown;
  source_label?: unknown;
  source_url?: unknown;
  terms?: unknown;
  title?: unknown;
};

const validLibraryTypes = new Set<InfringementReferenceLibraryType>(["high_risk", "allowlist"]);
const validCategories = new Set<InfringementRuleCategory>([
  "brand",
  "celebrity",
  "character",
  "copyright_phrase",
  "logo",
  "marketplace",
  "sports",
  "visual_review",
]);
const validRiskLevels = new Set<InfringementRiskLevel>(["unknown", "low", "medium", "high", "critical"]);
const validSeverities = new Set<InfringementSeverity>(["low", "medium", "high", "critical"]);

const referenceColumns = [
  "id",
  "library_type",
  "category",
  "title",
  "terms",
  "image_url",
  "image_hash",
  "risk_level",
  "severity",
  "description",
  "source_label",
  "source_url",
  "notes",
  "is_active",
].join(",");

const builtInSampleLimit = 120;
const builtInSeedNotePrefix = "auto:built-in:";
const seedInsertChunkSize = 50;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTerms(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 80);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 80);
  }

  return [];
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || (error.message ?? "").toLowerCase().includes("infringement_reference_items");
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\s_]+/g, " ")
    .trim();
}

function builtInReferenceSearchText(item: InfringementReferenceItem) {
  return normalizeSearchText(
    [
      item.title,
      item.description,
      item.category,
      item.sourceLabel,
      item.sourceUrl,
      ...item.terms,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function sortBuiltInReferences(left: InfringementReferenceItem, right: InfringementReferenceItem) {
  if (left.imageHash && !right.imageHash) return -1;
  if (!left.imageHash && right.imageHash) return 1;
  if (left.category === "celebrity" && right.category !== "celebrity") return -1;
  if (left.category !== "celebrity" && right.category === "celebrity") return 1;
  return left.title.localeCompare(right.title);
}

function getBuiltInSample(keyword: string) {
  const normalizedKeyword = normalizeSearchText(keyword);
  const matches = normalizedKeyword
    ? builtInHighRiskReferenceItems.filter((item) => builtInReferenceSearchText(item).includes(normalizedKeyword))
    : builtInHighRiskReferenceItems;

  return {
    items: [...matches].sort(sortBuiltInReferences).slice(0, builtInSampleLimit),
    total: matches.length,
  };
}

async function readDatabaseItems(): Promise<{ items: InfringementReferenceItem[]; setupRequired: boolean }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("infringement_reference_items")
    .select(referenceColumns)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    if (isMissingTableError(error)) {
      return { items: [], setupRequired: true };
    }

    throw new Error(error.message);
  }

  return {
    items: ((data ?? []) as unknown as ReferenceRow[]).map(normalizeReferenceRow),
    setupRequired: false,
  };
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const keyword = stringValue(searchParams.get("q")).slice(0, 120);
    const builtInSample = getBuiltInSample(keyword);
    const { items, setupRequired } = await readDatabaseItems();
    return NextResponse.json({
      built_in: {
        high_risk_count: builtInHighRiskReferenceItems.length,
        sample: builtInSample.items,
        search_total: builtInSample.total,
        stats: builtInReferenceStats,
      },
      items,
      setup_required: setupRequired,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取参考库失败", items: [] },
      { status: 500 },
    );
  }
}

function titleFromUrl(url: string) {
  try {
    const path = new URL(url).pathname;
    const name = decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "");
    return name.slice(0, 80) || "批量导入图片";
  } catch {
    return "批量导入图片";
  }
}

function builtInSeedNote(item: InfringementReferenceItem) {
  const marker = `${builtInSeedNotePrefix}${item.id}`;
  return item.notes ? `${marker}\n${item.notes}` : marker;
}

function extractBuiltInSeedId(notes: string | null | undefined) {
  if (!notes?.startsWith(builtInSeedNotePrefix)) return null;
  return notes.split(/\r?\n/, 1)[0]?.slice(builtInSeedNotePrefix.length) || null;
}

async function fetchSeededBuiltInIds(supabase: ReturnType<typeof createSupabaseServiceRoleClient>) {
  const ids = new Set<string>();

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("infringement_reference_items")
      .select("notes")
      .like("notes", `${builtInSeedNotePrefix}%`)
      .range(from, from + 999);

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as Array<{ notes: string | null }>) {
      const id = extractBuiltInSeedId(row.notes);
      if (id) ids.add(id);
    }

    if ((data ?? []).length < 1000) break;
  }

  return ids;
}

function toBuiltInSeedRow(item: InfringementReferenceItem) {
  const terms = item.terms.length > 0 ? item.terms : [item.title];

  return {
    category: item.category,
    description: item.description,
    image_hash: item.imageHash,
    image_url: item.imageUrl,
    is_active: true,
    library_type: item.libraryType,
    notes: builtInSeedNote(item),
    risk_level: item.riskLevel,
    severity: item.severity,
    source_label: item.sourceLabel ?? "内置高风险库",
    source_url: item.sourceUrl,
    terms,
    title: item.title,
  };
}

async function handleSeedBuiltInReferences() {
  const supabase = createSupabaseServiceRoleClient();

  try {
    const seededIds = await fetchSeededBuiltInIds(supabase);
    const rows = builtInHighRiskReferenceItems
      .filter((item) => !seededIds.has(item.id))
      .map(toBuiltInSeedRow);
    let added = 0;

    for (const chunk of chunkArray(rows, seedInsertChunkSize)) {
      const { error } = await supabase.from("infringement_reference_items").insert(chunk);

      if (error) {
        if (isMissingTableError(error)) {
          return NextResponse.json(
            { error: "参考库表还没有创建，请先执行最新 Supabase migration。", ok: false },
            { status: 500 },
          );
        }

        throw new Error(error.message);
      }

      added += chunk.length;
    }

    return NextResponse.json({
      added,
      ok: true,
      skipped: builtInHighRiskReferenceItems.length - rows.length,
      total: builtInHighRiskReferenceItems.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入内置参考库失败", ok: false },
      { status: 500 },
    );
  }
}

// 批量导入图片 URL:逐张算感知 hash 入库(整图指纹比对)。客户端分批调用、单次最多 50。
async function handleBulkReferenceUrls(body: CreateReferenceRequest): Promise<NextResponse> {
  const libraryType = (stringValue(body.library_type) as InfringementReferenceLibraryType) || "high_risk";
  if (!validLibraryTypes.has(libraryType)) {
    return NextResponse.json({ error: "参考库类型无效" }, { status: 400 });
  }

  const category: InfringementRuleCategory = libraryType === "allowlist" ? "marketplace" : "visual_review";
  const riskLevel: InfringementRiskLevel = libraryType === "allowlist" ? "unknown" : "high";
  const severity: InfringementSeverity = libraryType === "allowlist" ? "low" : "high";

  const urls = Array.from(
    new Set(
      (body.image_urls as unknown[])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => /^https?:\/\//i.test(item)),
    ),
  ).slice(0, 50);

  if (urls.length === 0) {
    return NextResponse.json({ error: "没有有效的图片 URL" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const results: Array<{ error?: string; status: "added" | "skipped" | "failed"; url: string }> = [];
  const queue = [...urls];

  async function worker() {
    for (;;) {
      const url = queue.shift();
      if (!url) return;

      try {
        const imageHash = await computeAverageHashFromUrl(url);

        const { data: existing } = await supabase
          .from("infringement_reference_items")
          .select("id")
          .eq("image_hash", imageHash)
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ status: "skipped", url });
          continue;
        }

        const { error } = await supabase.from("infringement_reference_items").insert({
          category,
          description: "批量导入的参考图片(整图指纹比对)。",
          image_hash: imageHash,
          image_url: url,
          is_active: true,
          library_type: libraryType,
          notes: "auto:bulk-url-import",
          risk_level: riskLevel,
          severity,
          source_label: "批量导入",
          terms: [],
          title: titleFromUrl(url),
        });

        if (error) {
          results.push({
            error: isMissingTableError(error) ? "参考库表未创建,请先执行最新 Supabase migration" : error.message,
            status: "failed",
            url,
          });
        } else {
          results.push({ status: "added", url });
        }
      } catch (requestError) {
        results.push({
          error: requestError instanceof Error ? requestError.message : "处理失败",
          status: "failed",
          url,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, urls.length) }, () => worker()));

  return NextResponse.json({
    added: results.filter((item) => item.status === "added").length,
    failed: results.filter((item) => item.status === "failed").length,
    ok: true,
    results,
    skipped: results.filter((item) => item.status === "skipped").length,
  });
}

export async function POST(request: Request) {
  let body: CreateReferenceRequest;

  try {
    body = await request.json() as CreateReferenceRequest;
  } catch {
    return NextResponse.json({ error: "无法读取参考库参数" }, { status: 400 });
  }

  if (stringValue(body.action) === "seed_built_in") {
    return handleSeedBuiltInReferences();
  }

  // 批量模式:传了 image_urls 数组就逐张入库
  if (Array.isArray(body.image_urls) && body.image_urls.length > 0) {
    return handleBulkReferenceUrls(body);
  }

  const libraryType = stringValue(body.library_type) as InfringementReferenceLibraryType;
  const category = stringValue(body.category) as InfringementRuleCategory;
  const riskLevel = stringValue(body.risk_level) as InfringementRiskLevel;
  const severity = stringValue(body.severity) as InfringementSeverity;
  const title = stringValue(body.title);
  const terms = parseTerms(body.terms);
  const imageUrl = stringValue(body.image_url);

  if (!validLibraryTypes.has(libraryType)) {
    return NextResponse.json({ error: "参考库类型无效" }, { status: 400 });
  }

  if (!validCategories.has(category)) {
    return NextResponse.json({ error: "参考库分类无效" }, { status: 400 });
  }

  if (!validRiskLevels.has(riskLevel)) {
    return NextResponse.json({ error: "风险等级无效" }, { status: 400 });
  }

  if (!validSeverities.has(severity)) {
    return NextResponse.json({ error: "规则严重程度无效" }, { status: 400 });
  }

  if (!title && terms.length === 0 && !imageUrl) {
    return NextResponse.json({ error: "请至少填写标题、关键词或图片 URL" }, { status: 400 });
  }

  let imageHash: string | null = null;
  if (imageUrl) {
    try {
      imageHash = await computeAverageHashFromUrl(imageUrl);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? `图片哈希计算失败：${error.message}` : "图片哈希计算失败" },
        { status: 400 },
      );
    }
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("infringement_reference_items")
      .insert({
        category,
        description: stringValue(body.description) || null,
        image_hash: imageHash,
        image_url: imageUrl || null,
        is_active: true,
        library_type: libraryType,
        notes: stringValue(body.notes) || null,
        risk_level: riskLevel,
        severity,
        source_label: stringValue(body.source_label) || null,
        source_url: stringValue(body.source_url) || null,
        terms,
        title: title || terms[0] || imageUrl,
      })
      .select(referenceColumns)
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: "参考库表还没有创建，请先执行最新 Supabase migration。" },
          { status: 500 },
        );
      }

      throw new Error(error.message);
    }

    return NextResponse.json({
      item: normalizeReferenceRow(data as unknown as ReferenceRow),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存参考库失败" },
      { status: 500 },
    );
  }
}
