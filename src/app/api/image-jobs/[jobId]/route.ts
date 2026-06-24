import { NextResponse } from "next/server";

import { processResizeJob } from "@/lib/image-processing/resize-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ImageJobDetailRow = {
  created_at: string;
  error_message: string | null;
  failed_count: number;
  id: string;
  job_type: string;
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

type ImageJobItemStatusRow = {
  id: string;
  status: string;
};

function getPrimaryDerivativeType(jobType: string) {
  if (jobType === "cutout") return "cutout";
  if (jobType === "print_extraction") return "print_extract_final";
  return null;
}

function getJobId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

async function markJobFailed(jobId: string, errorMessage: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("image_job_items")
    .select("id,status")
    .eq("job_id", jobId);

  const items = (data ?? []) as unknown as ImageJobItemStatusRow[];
  const unfinishedItems = items.filter(
    (item) => item.status === "pending" || item.status === "processing",
  );

  if (unfinishedItems.length > 0) {
    await supabase
      .from("image_job_items")
      .update({
        error_message: errorMessage,
        status: "failed",
      })
      .in(
        "id",
        unfinishedItems.map((item) => item.id),
      );
  }

  const successCount = items.filter((item) => item.status === "completed").length;
  const failedCount = items.filter((item) => item.status === "failed").length + unfinishedItems.length;

  await supabase
    .from("image_jobs")
    .update({
      error_message: errorMessage,
      failed_count: failedCount,
      status: "failed",
      success_count: successCount,
      total_count: items.length,
    })
    .eq("id", jobId);
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

    const job = {
      ...jobRow,
      items: items.map((item) => {
        const derivative = derivativeByItemId.get(item.id);

        return {
          ...item,
          derivative_id: derivative?.id ?? null,
          output_url: item.output_url ?? derivative?.output_url ?? null,
          preview_url: derivative?.preview_url ?? item.output_url ?? null,
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
    const job = await processResizeJob(supabase, jobId);
    return NextResponse.json({ job });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "任务处理失败";
    await markJobFailed(jobId, errorMessage);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
