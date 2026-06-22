import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";

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

  return "Unknown error";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-") || "background";
}

async function uploadBackground(file: File): Promise<UploadResult> {
  try {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error("Only jpg, jpeg, png, and webp scene backgrounds are supported.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const datePath = new Date().toISOString().slice(0, 10);
    const storagePath = `mockup-backgrounds/${datePath}/${randomUUID()}-${sanitizeFilename(file.name)}`;
    const savedBackground = await saveLocalAssetAtPath({
      buffer,
      relativePath: storagePath,
    });

    return {
      filename: file.name,
      success: true,
      url: savedBackground.publicUrl,
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
      { error: "Unable to read upload form.", results: [] },
      { status: 400 },
    );
  }

  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Please select at least one background image.", results: [] }, { status: 400 });
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