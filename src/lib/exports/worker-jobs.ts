import "server-only";

import {
  createExportFilename,
  writePublicExportFile,
} from "@/lib/exports/files";
import {
  getExportProductsByIds,
  getProductImageUrls,
} from "@/lib/exports/products";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ExportRecordRow = {
  id: string;
  product_count: number;
  product_ids: unknown;
  status: string;
};

export type ExportZipFileInput = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

export async function claimExportImagesZipJob(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("export_records")
    .select("id,product_ids,product_count,status")
    .eq("export_type", "images_zip")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`Export ZIP job claim failed: ${error.message}`);
  }

  for (const row of (data ?? []) as unknown as ExportRecordRow[]) {
    const { data: claimed } = await supabase
      .from("export_records")
      .update({ error_message: null, status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id,product_ids,product_count,status")
      .maybeSingle();

    if (claimed) {
      const record = claimed as unknown as ExportRecordRow;

      return {
        export_type: "images_zip" as const,
        item_id: record.id,
        job_id: record.id,
        job_type: "export_images_zip" as const,
        record_id: record.id,
      };
    }
  }

  return null;
}

export async function getExportImagesZipPayload(
  supabase: SupabaseServiceClient,
  recordId: string,
) {
  const { data, error } = await supabase
    .from("export_records")
    .select("id,product_ids,product_count,status")
    .eq("id", recordId)
    .single();

  if (error) {
    throw new Error(`Export ZIP record read failed: ${error.message}`);
  }

  const record = data as unknown as ExportRecordRow;
  const products = await getExportProductsByIds(record.product_ids);

  return {
    filename: createExportFilename("product-images", "zip"),
    products: products.map((product) => ({
      id: product.id,
      image_urls: getProductImageUrls(product),
      sku: product.sku,
    })),
    record_id: record.id,
  };
}

export async function completeExportImagesZipJob(
  supabase: SupabaseServiceClient,
  recordId: string,
  file: ExportZipFileInput,
) {
  const filename =
    file.filename && file.filename.endsWith(".zip")
      ? file.filename
      : createExportFilename("product-images", "zip");
  const { downloadUrl } = await writePublicExportFile(filename, file.buffer);

  const { data, error } = await supabase
    .from("export_records")
    .update({
      download_url: downloadUrl,
      error_message: null,
      filename,
      status: "completed",
    })
    .eq("id", recordId)
    .select("id,export_type,product_count,filename,download_url,status,error_message,created_at")
    .single();

  if (error) {
    throw new Error(`Export ZIP completion update failed: ${error.message}`);
  }

  return data;
}

export async function failExportImagesZipJob(
  supabase: SupabaseServiceClient,
  recordId: string,
  errorMessage: string,
) {
  const { data, error } = await supabase
    .from("export_records")
    .update({
      error_message: errorMessage,
      status: "failed",
    })
    .eq("id", recordId)
    .select("id,export_type,product_count,filename,download_url,status,error_message,created_at")
    .single();

  if (error) {
    throw new Error(`Export ZIP failure update failed: ${error.message}`);
  }

  return data;
}
