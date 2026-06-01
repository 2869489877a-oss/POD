import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ASSETS_BUCKET = "assets";
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type UploadResult = {
  error?: string;
  filename: string;
  success: boolean;
  url?: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-") || "background";
}

async function uploadBackground(file: File): Promise<UploadResult> {
  try {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error("仅支持 jpg、jpeg、png、webp 场景底图");
    }

    const supabase = createSupabaseServiceRoleClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const datePath = new Date().toISOString().slice(0, 10);
    const storagePath = `mockup-backgrounds/${datePath}/${randomUUID()}-${sanitizeFilename(
      file.name,
    )}`;

    const { error: uploadError } = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`底图上传失败：${uploadError.message}`);
    }

    const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(storagePath);

    return {
      filename: file.name,
      success: true,
      url: data.publicUrl,
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      filename: file.name,
      success: false,
    };
  }
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "无法读取上传表单", results: [] },
      { status: 400 },
    );
  }

  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "请选择至少一张底图", results: [] }, { status: 400 });
  }

  const results = await Promise.all(files.map((file) => uploadBackground(file)));
  const hasSuccess = results.some((result) => result.success);

  return NextResponse.json(
    {
      failed_count: results.filter((result) => !result.success).length,
      results,
      success_count: results.filter((result) => result.success).length,
    },
    { status: hasSuccess ? 200 : 400 },
  );
}
