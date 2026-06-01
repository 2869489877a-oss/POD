import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
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
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, jobs: [] }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}
