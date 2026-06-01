import { NextResponse } from "next/server";

import { runImageCollectionTemplate } from "@/lib/image-collector/collector";
import { calculateNextRunAt, shouldRunTemplate } from "@/lib/image-collector/schedule";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ImageCollectionTemplate } from "@/types/image-collector";

export const runtime = "nodejs";

type ScheduledTemplateRow = Pick<
  ImageCollectionTemplate,
  | "cron_expression"
  | "id"
  | "last_run_at"
  | "name"
  | "next_run_at"
  | "schedule_enabled"
  | "status"
>;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return request.headers.get("user-agent")?.toLowerCase().includes("vercel-cron/1.0") ?? false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "未授权的 Cron 请求" }, { status: 401 });
  }

  const now = new Date();
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("image_collection_templates")
    .select("id,name,status,schedule_enabled,cron_expression,last_run_at,next_run_at")
    .eq("status", "active")
    .eq("schedule_enabled", true)
    .order("next_run_at", { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const templates = (data ?? []) as unknown as ScheduledTemplateRow[];
  const results = [];

  for (const template of templates) {
    try {
      if (!shouldRunTemplate(template, now)) {
        results.push({
          status: "skipped",
          template_id: template.id,
          template_name: template.name,
        });
        continue;
      }

      const run = await runImageCollectionTemplate(template.id, "scheduled");
      results.push({
        run_id: run.id,
        status: run.status,
        template_id: template.id,
        template_name: template.name,
        total_downloaded: run.total_downloaded,
        total_failed: run.total_failed,
        total_found: run.total_found,
      });
    } catch (runError) {
      let nextRunAt: string | null = null;

      try {
        nextRunAt = calculateNextRunAt(template, now);
      } catch {
        nextRunAt = null;
      }

      await supabase
        .from("image_collection_templates")
        .update({ next_run_at: nextRunAt })
        .eq("id", template.id);

      results.push({
        error: runError instanceof Error ? runError.message : "自动采集运行失败",
        status: "failed",
        template_id: template.id,
        template_name: template.name,
      });
    }
  }

  return NextResponse.json({
    checked: templates.length,
    executed: results.filter((result) => result.status !== "skipped").length,
    results,
  });
}
