import { NextResponse } from "next/server";

import {
  getFissionEffect,
  getFissionOutputSize,
  normalizeFissionOutputFormat,
  normalizeFissionStrength,
} from "@/lib/image-processing/fission-effects";
import { createLocalWorkerImageJob } from "@/lib/local-worker/image-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CreateFissionJobRequest = {
  asset_ids?: unknown;
  effect_key?: unknown;
  output_format?: unknown;
  output_size?: unknown;
  strength?: unknown;
};

function getUniqueAssetIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

async function readRequestBody(request: Request): Promise<CreateFissionJobRequest> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as CreateFissionJobRequest;
  }

  const form = await request.formData();
  return {
    asset_ids: form.getAll("asset_ids[]").filter((item): item is string => typeof item === "string"),
    effect_key: form.get("effect_key"),
    output_format: form.get("output_format"),
    output_size: form.get("output_size"),
    strength: form.get("strength"),
  };
}

export async function POST(request: Request) {
  let body: CreateFissionJobRequest;

  try {
    body = await readRequestBody(request);
  } catch {
    return NextResponse.json({ error: "无法读取裂变任务参数" }, { status: 400 });
  }

  const assetIds = getUniqueAssetIds(body.asset_ids);
  const effect = getFissionEffect(body.effect_key);
  const outputSize = getFissionOutputSize(body.output_size);
  const outputFormat = normalizeFissionOutputFormat(body.output_format);
  const strength = normalizeFissionStrength(body.strength);

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "请选择至少一张图片" }, { status: 400 });
  }

  if (!effect || typeof body.effect_key !== "string") {
    return NextResponse.json({ error: "请选择有效的裂变效果" }, { status: 400 });
  }

  if (!outputSize || typeof body.output_size !== "string") {
    return NextResponse.json({ error: "请选择有效的输出尺寸" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await createLocalWorkerImageJob(supabase, {
      assetIds,
      jobType: "fission",
      mode: body.effect_key,
      options: {
        effect_key: body.effect_key,
        effect_label: effect.label,
        output_format: outputFormat,
        output_height: outputSize.height,
        output_size: body.output_size,
        output_width: outputSize.width,
        strength,
      },
      setPreferred: false,
    });

    return NextResponse.json({
      job,
      message: `裂变任务已创建：${effect.label}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "裂变任务创建失败" },
      { status: 500 },
    );
  }
}
