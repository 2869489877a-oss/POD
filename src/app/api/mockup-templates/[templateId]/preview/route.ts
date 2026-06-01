import { NextResponse } from "next/server";

import { renderMockupPreviews } from "@/lib/mockups/render-preview";
import { validateScenes } from "@/lib/mockups/scenes";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getTemplateId(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(-2) ?? "");
}

export async function POST(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少模板 ID" }, { status: 400 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "无法读取预览表单" }, { status: 400 });
  }

  const printImage = formData.get("print_image");

  if (!(printImage instanceof File)) {
    return NextResponse.json({ error: "请上传一张测试印花图" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(printImage.type)) {
    return NextResponse.json({ error: "测试印花只支持 jpg、jpeg、png、webp" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: template, error } = await supabase
    .from("mockup_templates")
    .select("id,scenes")
    .eq("id", templateId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let scenes;

  try {
    scenes = validateScenes((template as unknown as { scenes: unknown }).scenes);
  } catch (validationError) {
    return NextResponse.json(
      {
        error:
          validationError instanceof Error ? validationError.message : "模板 scenes JSON 不合法",
      },
      { status: 400 },
    );
  }

  const printBuffer = Buffer.from(await printImage.arrayBuffer());
  const previews = await renderMockupPreviews(supabase, templateId, scenes, printBuffer);

  return NextResponse.json({
    failed_count: previews.filter((preview) => !preview.success).length,
    previews,
    success_count: previews.filter((preview) => preview.success).length,
  });
}
