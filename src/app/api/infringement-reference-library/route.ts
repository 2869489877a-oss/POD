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
  category?: unknown;
  description?: unknown;
  image_url?: unknown;
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

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || (error.message ?? "").toLowerCase().includes("infringement_reference_items");
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

export async function GET() {
  try {
    const { items, setupRequired } = await readDatabaseItems();
    return NextResponse.json({
      built_in: {
        high_risk_count: builtInHighRiskReferenceItems.length,
        stats: builtInReferenceStats,
        sample: builtInHighRiskReferenceItems.slice(0, 120),
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

export async function POST(request: Request) {
  let body: CreateReferenceRequest;

  try {
    body = await request.json() as CreateReferenceRequest;
  } catch {
    return NextResponse.json({ error: "无法读取参考库参数" }, { status: 400 });
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
