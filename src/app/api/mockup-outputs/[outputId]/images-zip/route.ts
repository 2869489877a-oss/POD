import { NextResponse } from "next/server";

import {
  sanitizeFileSegment,
  writePublicExportFile,
} from "@/lib/exports/files";
import { buildOrderedImagesZip } from "@/lib/exports/images-zip";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type MockupOutputForZip = {
  asset_id: string;
  id: string;
  output_images: unknown;
};

function getOutputId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const outputsIndex = segments.indexOf("mockup-outputs");
  return outputsIndex >= 0 ? decodeURIComponent(segments[outputsIndex + 1] ?? "") : "";
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function filenameStem(filename: string | null | undefined) {
  return filename?.replace(/\.[^.]+$/, "") ?? "";
}

async function getZipName(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  output: MockupOutputForZip,
) {
  const [draftResponse, assetResponse] = await Promise.all([
    supabase
      .from("product_drafts")
      .select("sku")
      .eq("mockup_output_id", output.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("assets").select("filename").eq("id", output.asset_id).maybeSingle(),
  ]);

  if (draftResponse.error) {
    throw new Error(draftResponse.error.message);
  }

  if (assetResponse.error) {
    throw new Error(assetResponse.error.message);
  }

  const sku = (draftResponse.data as { sku?: string } | null)?.sku;
  const filename = (assetResponse.data as { filename?: string } | null)?.filename;
  const name = sanitizeFileSegment(sku || filenameStem(filename), output.id);

  return `${name}.zip`;
}

export async function POST(request: Request) {
  const outputId = getOutputId(request);

  if (!outputId) {
    return NextResponse.json({ error: "缺少套图结果 ID" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from("mockup_outputs")
      .select("id,asset_id,output_images")
      .eq("id", outputId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ error: "套图结果不存在，请刷新后重试" }, { status: 404 });
    }

    const output = data as unknown as MockupOutputForZip;
    const imageUrls = toStringArray(output.output_images);
    const archive = await buildOrderedImagesZip(imageUrls, {
      emptyMessage: "该套图没有图片，无法下载",
    });
    const filename = await getZipName(supabase, output);
    const { downloadUrl } = await writePublicExportFile(filename, archive);

    return NextResponse.json({
      count: imageUrls.length,
      download_url: downloadUrl,
      filename,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "下载套图 ZIP 失败";
    const status = message.includes("没有图片") ? 400 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
