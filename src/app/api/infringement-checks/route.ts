import { NextResponse } from "next/server";

import {
  mapDetectionStatusToAssetCopyrightStatus,
  runInfringementDetection,
} from "@/lib/infringement/detector";
import type { InfringementCheckStatus } from "@/lib/infringement/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AssetRow = {
  copyright_status: string;
  filename: string;
  id: string;
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

  if (ids.length > 100) {
    throw new Error("单次最多检测 100 张素材");
  }

  return ids;
}

function arrayOrEmpty(value: string[] | null) {
  return Array.isArray(value) ? value : [];
}

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("infringement_checks")
    .select(checkColumns)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ checks: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ checks: data ?? [] });
}

export async function POST(request: Request) {
  let body: CreateChecksRequest;

  try {
    body = (await request.json()) as CreateChecksRequest;
  } catch {
    return NextResponse.json({ error: "无法读取检测参数", results: [] }, { status: 400 });
  }

  try {
    const assetIds = parseAssetIds(body.asset_ids);
    const supabase = createSupabaseServiceRoleClient();
    const { data: assetData, error: assetError } = await supabase
      .from("assets")
      .select("id,filename,original_url,source,copyright_status")
      .in("id", assetIds);

    if (assetError) {
      throw new Error(assetError.message);
    }

    const assets = (assetData ?? []) as unknown as AssetRow[];

    if (assets.length !== assetIds.length) {
      throw new Error("部分素材不存在，请刷新后重试");
    }

    const { data: productData, error: productError } = await supabase
      .from("product_drafts")
      .select("asset_id,title,description,tags,bullet_points,sku,product_type")
      .in("asset_id", assetIds);

    if (productError) {
      throw new Error(productError.message);
    }

    const productsByAssetId = new Map<string, ProductTextRow[]>();
    for (const product of (productData ?? []) as unknown as ProductTextRow[]) {
      const current = productsByAssetId.get(product.asset_id) ?? [];
      current.push(product);
      productsByAssetId.set(product.asset_id, current);
    }

    const insertRows = assets.map((asset) => {
      const result = runInfringementDetection({
        asset,
        productTexts: (productsByAssetId.get(asset.id) ?? []).map((product) => ({
          bullet_points: arrayOrEmpty(product.bullet_points),
          description: product.description,
          product_type: product.product_type,
          sku: product.sku,
          tags: arrayOrEmpty(product.tags),
          title: product.title,
        })),
      });

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

    const { data: checks, error: insertError } = await supabase
      .from("infringement_checks")
      .insert(insertRows)
      .select(checkColumns);

    if (insertError) {
      throw new Error(insertError.message);
    }

    const insertedChecks = (checks ?? []) as unknown as InfringementCheckInsertRow[];

    await Promise.all(
      assets.map((asset) => {
        const check = insertedChecks.find((item) => item.asset_id === asset.id);
        if (!check) return Promise.resolve();

        const nextCopyrightStatus = mapDetectionStatusToAssetCopyrightStatus(
          check.status,
          asset.copyright_status,
        );

        if (nextCopyrightStatus === asset.copyright_status) {
          return Promise.resolve();
        }

        return supabase
          .from("assets")
          .update({ copyright_status: nextCopyrightStatus })
          .eq("id", asset.id)
          .then(({ error }) => {
            if (error) throw new Error(error.message);
          });
      }),
    );

    return NextResponse.json({
      checks: insertedChecks,
      message: `已完成 ${insertedChecks.length} 张素材的规则检测`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "侵权检测失败", results: [] },
      { status: 500 },
    );
  }
}
