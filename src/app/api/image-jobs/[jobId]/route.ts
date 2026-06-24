import { NextResponse } from "next/server";

import { getResizeJobProgress } from "@/lib/image-processing/resize-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ImageJobDetailRow = {
  created_at: string;
  error_message: string | null;
  failed_count: number;
  id: string;
  job_type: string;
  options: unknown;
  status: string;
  success_count: number;
  total_count: number;
  updated_at: string;
};

type ImageJobItemDetailRow = {
  asset_id: string;
  created_at: string;
  error_message: string | null;
  id: string;
  input_url: string;
  job_id: string;
  output_url: string | null;
  status: string;
  updated_at: string;
};

type ImageDerivativeDetailRow = {
  created_at: string;
  derivative_type: string;
  id: string;
  job_item_id: string | null;
  output_url: string | null;
  preview_url: string | null;
  status: string;
};

type MockupOutputDetailRow = {
  asset_id: string;
  created_at: string;
  error_message: string | null;
  id: string;
  output_images: unknown;
  status: string;
  template_id: string | null;
};

function getStringOption(options: unknown, key: string) {
  if (!options || typeof options !== "object" || !(key in options)) {
    return null;
  }

  const value = (options as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getPrimaryDerivativeType(jobType: string) {
  if (jobType === "cutout") return "cutout";
  if (jobType === "print_extraction") return "print_extract_final";
  return null;
}

function getJobId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export async function GET(request: Request) {
  const jobId = getJobId(request);

  if (!jobId) {
    return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: jobData, error: jobError } = await supabase
      .from("image_jobs")
      .select(
        [
          "id",
          "job_type",
          "options",
          "status",
          "total_count",
          "success_count",
          "failed_count",
          "error_message",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .eq("id", jobId)
      .single();

    if (jobError) {
      throw new Error(jobError.message);
    }

    const { data: itemData, error: itemError } = await supabase
      .from("image_job_items")
      .select(
        [
          "id",
          "job_id",
          "asset_id",
          "input_url",
          "output_url",
          "status",
          "error_message",
          "created_at",
          "updated_at",
        ].join(","),
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    if (itemError) {
      throw new Error(itemError.message);
    }

    const jobRow = jobData as unknown as ImageJobDetailRow;
    const items = (itemData ?? []) as unknown as ImageJobItemDetailRow[];
    const primaryDerivativeType = getPrimaryDerivativeType(jobRow.job_type);
    const derivativeByItemId = new Map<string, ImageDerivativeDetailRow>();
    const mockupByItemId = new Map<string, MockupOutputDetailRow>();

    if (primaryDerivativeType && items.length > 0) {
      const { data: derivativeData, error: derivativeError } = await supabase
        .from("image_derivatives")
        .select("id,job_item_id,derivative_type,output_url,preview_url,status,created_at")
        .eq("job_id", jobId)
        .eq("derivative_type", primaryDerivativeType)
        .in(
          "job_item_id",
          items.map((item) => item.id),
        )
        .order("created_at", { ascending: false });

      if (derivativeError) {
        throw new Error(derivativeError.message);
      }

      for (const derivative of (derivativeData ?? []) as unknown as ImageDerivativeDetailRow[]) {
        if (derivative.job_item_id && !derivativeByItemId.has(derivative.job_item_id)) {
          derivativeByItemId.set(derivative.job_item_id, derivative);
        }
      }
    }

    if (jobRow.job_type === "mockup" && items.length > 0) {
      const templateId = getStringOption(jobRow.options, "template_id");
      const assetIds = Array.from(new Set(items.map((item) => item.asset_id)));

      if (templateId) {
        const { data: mockupData, error: mockupError } = await supabase
          .from("mockup_outputs")
          .select("id,asset_id,template_id,output_images,status,error_message,created_at")
          .eq("template_id", templateId)
          .in("asset_id", assetIds)
          .gte("created_at", jobRow.created_at)
          .order("created_at", { ascending: false });

        if (mockupError) {
          throw new Error(mockupError.message);
        }

        const itemByAssetId = new Map(items.map((item) => [item.asset_id, item]));
        for (const output of (mockupData ?? []) as unknown as MockupOutputDetailRow[]) {
          const item = itemByAssetId.get(output.asset_id);
          if (!item || mockupByItemId.has(item.id)) {
            continue;
          }

          const outputImages = toStringArray(output.output_images);
          if (item.output_url && outputImages.length > 0 && !outputImages.includes(item.output_url)) {
            continue;
          }

          mockupByItemId.set(item.id, output);
        }
      }
    }

    const job = {
      ...jobRow,
      items: items.map((item) => {
        const derivative = derivativeByItemId.get(item.id);
        const mockup = mockupByItemId.get(item.id);
        const mockupImages = mockup ? toStringArray(mockup.output_images) : [];

        return {
          ...item,
          derivative_id: derivative?.id ?? null,
          mockup_output_id: mockup?.id ?? null,
          output_images: mockupImages,
          output_url: item.output_url ?? derivative?.output_url ?? mockupImages[0] ?? null,
          preview_url: derivative?.preview_url ?? item.output_url ?? mockupImages[0] ?? null,
        };
      }),
    };

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取任务失败" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const jobId = getJobId(request);

  if (!jobId) {
    return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    const job = await getResizeJobProgress(supabase, jobId);
    return NextResponse.json({
      job,
      message: "任务已进入本地 worker 队列，请轮询 GET 接口查看进度",
      queued: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "任务处理失败";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
