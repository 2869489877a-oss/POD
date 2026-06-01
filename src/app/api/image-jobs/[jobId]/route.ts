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

type ImageJobItemStatusRow = {
  id: string;
  status: string;
};

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

    const job = {
      ...(jobData as unknown as ImageJobDetailRow),
      items: (itemData ?? []) as unknown as ImageJobItemDetailRow[],
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
