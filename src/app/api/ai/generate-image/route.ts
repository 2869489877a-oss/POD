import { NextResponse } from "next/server";

import {
  createAiGenerateImageJob,
  executeAiGenerateImageJob,
  type AiGenerateImageJobInput,
} from "@/lib/ai-image/worker-jobs";
import { checkDailyImageQuota, logUsage } from "@/lib/auth/usage";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 420;

type GenerateImageRequest = {
  async?: unknown;
  background_feather?: unknown;
  background_tolerance?: unknown;
  background_transparency?: unknown;
  height?: unknown;
  product_draft_id?: unknown;
  prompt?: unknown;
  provider_id?: unknown;
  queue?: unknown;
  reference_url?: unknown;
  routing_profile?: unknown;
  save_to_assets?: unknown;
  style?: unknown;
  transparent_background?: unknown;
  wait?: unknown;
  width?: unknown;
};

function optionalNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function shouldQueue(body: GenerateImageRequest) {
  return body.queue === true || body.async === true || body.wait === false;
}

function buildInput(body: GenerateImageRequest): AiGenerateImageJobInput | { error: string } {
  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return { error: "请填写生图提示词" };
  }

  return {
    backgroundFeather: optionalNumber(body.background_feather, 18, 0, 80),
    backgroundTolerance: optionalNumber(body.background_tolerance, 42, 1, 180),
    backgroundTransparency: optionalNumber(body.background_transparency, 100, 0, 100),
    height: typeof body.height === "number" && body.height > 0 ? body.height : 1024,
    productDraftId: typeof body.product_draft_id === "string" && body.product_draft_id.trim().length > 0
      ? body.product_draft_id.trim()
      : null,
    prompt: body.prompt.trim(),
    providerId: typeof body.provider_id === "string" ? body.provider_id : undefined,
    referenceUrl: typeof body.reference_url === "string" && body.reference_url.trim().length > 0
      ? body.reference_url.trim()
      : undefined,
    routingProfile: typeof body.routing_profile === "string" ? body.routing_profile : undefined,
    saveToAssets: body.save_to_assets !== false,
    style: typeof body.style === "string" ? body.style.trim() : undefined,
    transparentBackground: body.transparent_background === true,
    width: typeof body.width === "number" && body.width > 0 ? body.width : 1024,
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const limit = optionalNumber(requestUrl.searchParams.get("limit"), 30, 1, 100);
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .select("id, provider_type, model_id, prompt, width, height, status, result_url, asset_id, error_message, stage, progress_percent, started_at, finished_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: `Failed to load generation history: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(request: Request) {
  let body: GenerateImageRequest;

  try {
    body = (await request.json()) as GenerateImageRequest;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const input = buildInput(body);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const quotaCheck = await checkDailyImageQuota(1);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      { error: quotaCheck.reason ?? "今日生图配额已用完", quota: quotaCheck.quota, used: quotaCheck.used },
      { status: 429 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  let jobId: string | null = null;

  try {
    const queued = shouldQueue(body);
    const job = await createAiGenerateImageJob(supabase, input, queued ? "pending" : "processing");
    jobId = job.id;

    if (queued) {
      await logUsage("ai_generate", 1, { job_id: jobId, model: job.resolved.modelId, queued: true });
      await logUsage("api_call", 1, { endpoint: "ai/generate-image", queued: true });

      return NextResponse.json(
        {
          job_id: jobId,
          queued: true,
          status: "pending",
        },
        { status: 202 },
      );
    }

    const result = await executeAiGenerateImageJob(supabase, jobId);

    await logUsage("ai_generate", 1, { job_id: jobId, model: result.model });
    await logUsage("api_call", 1, { endpoint: "ai/generate-image" });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "生图失败";
    const status = jobId ? 500 : 400;

    return NextResponse.json({ error: errorMessage, job_id: jobId }, { status });
  }
}
