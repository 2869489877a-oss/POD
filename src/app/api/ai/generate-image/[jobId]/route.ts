import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const generateIndex = segments.indexOf("generate-image");
  return generateIndex >= 0 ? decodeURIComponent(segments[generateIndex + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const jobId = getJobId(request);

  if (!jobId) {
    return NextResponse.json({ error: "缺少 AI 生图任务 ID" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .select("id,provider_type,model_id,prompt,width,height,status,result_url,asset_id,error_message,attempts,stage,progress_percent,started_at,finished_at,created_at,updated_at")
    .eq("id", jobId)
    .single();

  if (error) {
    return NextResponse.json({ error: `读取 AI 生图任务失败：${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ job: data });
}
