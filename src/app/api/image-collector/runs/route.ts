import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ImageCollectionRun } from "@/types/image-collector";

export const runtime = "nodejs";

type RunWithTemplateName = ImageCollectionRun & {
  template_name: string | null;
};

type TemplateNameRow = {
  id: string;
  name: string;
};

const runColumns = [
  "id",
  "template_id",
  "run_type",
  "root_folder",
  "status",
  "total_found",
  "total_downloaded",
  "total_failed",
  "error_message",
  "started_at",
  "completed_at",
  "created_at",
].join(",");

export async function GET() {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: runData, error: runError } = await supabase
      .from("image_collection_runs")
      .select(runColumns)
      .order("created_at", { ascending: false })
      .limit(50);

    if (runError) {
      throw new Error(runError.message);
    }

    const runs = (runData ?? []) as unknown as ImageCollectionRun[];
    const templateIds = Array.from(
      new Set(runs.map((run) => run.template_id).filter((id): id is string => Boolean(id))),
    );

    let templatesById = new Map<string, TemplateNameRow>();

    if (templateIds.length > 0) {
      const { data: templateData, error: templateError } = await supabase
        .from("image_collection_templates")
        .select("id,name")
        .in("id", templateIds);

      if (templateError) {
        throw new Error(templateError.message);
      }

      templatesById = new Map(
        ((templateData ?? []) as unknown as TemplateNameRow[]).map((template) => [
          template.id,
          template,
        ]),
      );
    }

    const rows: RunWithTemplateName[] = runs.map((run) => ({
      ...run,
      template_name: run.template_id ? templatesById.get(run.template_id)?.name ?? null : null,
    }));

    return NextResponse.json({ runs: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取采集历史失败", runs: [] },
      { status: 500 },
    );
  }
}
