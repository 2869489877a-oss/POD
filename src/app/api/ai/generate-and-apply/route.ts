import { NextResponse } from "next/server";

import {
  createAiApplyPatternJob,
  executeApplyPattern,
  parseApplyPatternPosition,
  type AiApplyPatternJobInput,
} from "@/lib/ai-image/apply-pattern-worker-jobs";
import { checkDailyImageQuota, logUsage } from "@/lib/auth/usage";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type GenerateAndApplyRequest = {
  asset_id?: unknown;
  async?: unknown;
  blend_mode?: unknown;
  garment_url?: unknown;
  opacity?: unknown;
  position?: unknown;
  provider_id?: unknown;
  queue?: unknown;
  reference_url?: unknown;
  style_description?: unknown;
  wait?: unknown;
};

function shouldQueue(body: GenerateAndApplyRequest) {
  return body.queue === true || body.async === true || body.wait === false;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function buildInput(body: GenerateAndApplyRequest): AiApplyPatternJobInput | { error: string } {
  const garmentUrl = typeof body.garment_url === "string" ? body.garment_url.trim() : "";
  const styleDescription = typeof body.style_description === "string" ? body.style_description.trim() : "";

  if (!garmentUrl) {
    return { error: "请提供衣服模板图片 URL (garment_url)" };
  }

  if (!styleDescription) {
    return { error: "请描述想要的印花风格 (style_description)" };
  }

  return {
    assetId: typeof body.asset_id === "string" && body.asset_id.trim().length > 0
      ? body.asset_id.trim()
      : null,
    blendMode: body.blend_mode === "multiply" ? "multiply" : "over",
    garmentUrl,
    opacity: numberValue(body.opacity, 100, 0, 100),
    position: parseApplyPatternPosition(body.position),
    providerId: typeof body.provider_id === "string" && body.provider_id.trim().length > 0
      ? body.provider_id.trim()
      : undefined,
    referenceUrl: typeof body.reference_url === "string" && body.reference_url.trim().length > 0
      ? body.reference_url.trim()
      : undefined,
    styleDescription,
  };
}

export async function POST(request: Request) {
  const quotaCheck = await checkDailyImageQuota(1);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      { error: quotaCheck.reason ?? "今日生图配额已用完" },
      { status: 429 },
    );
  }

  let body: GenerateAndApplyRequest;

  try {
    body = (await request.json()) as GenerateAndApplyRequest;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const input = buildInput(body);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    if (shouldQueue(body)) {
      const supabase = createSupabaseServiceRoleClient();
      const job = await createAiApplyPatternJob(supabase, input);

      await logUsage("ai_generate", 1, { endpoint: "ai/generate-and-apply", job_id: job.id, queued: true });
      await logUsage("api_call", 1, { endpoint: "ai/generate-and-apply", queued: true });

      return NextResponse.json(
        {
          job_id: job.id,
          queued: true,
          status: "pending",
        },
        { status: 202 },
      );
    }

    const result = await executeApplyPattern(input);
    await logUsage("ai_generate", 1, { endpoint: "ai/generate-and-apply", model: result.model });
    await logUsage("api_call", 1, { endpoint: "ai/generate-and-apply" });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成并贴图失败" },
      { status: 500 },
    );
  }
}
