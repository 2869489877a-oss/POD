import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ExportRecordView = {
  created_at: string;
  download_url: string | null;
  error_message: string | null;
  export_type: "excel" | "images_zip";
  filename: string | null;
  id: string;
  product_count: number;
  status: "completed" | "failed";
};

type CreateExportRecordInput = {
  downloadUrl?: string | null;
  errorMessage?: string | null;
  exportType: "excel" | "images_zip";
  filename?: string | null;
  productCount: number;
  productIds: string[];
  status: "completed" | "failed";
};

export function idsFromUnknown(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

export async function createExportRecord(input: CreateExportRecordInput) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("export_records")
    .insert({
      download_url: input.downloadUrl ?? null,
      error_message: input.errorMessage ?? null,
      export_type: input.exportType,
      filename: input.filename ?? null,
      product_count: input.productCount,
      product_ids: input.productIds,
      status: input.status,
    })
    .select("id,export_type,product_count,filename,download_url,status,error_message,created_at")
    .single();

  if (error) {
    throw new Error(`导出记录保存失败：${error.message}`);
  }

  return data as unknown as ExportRecordView;
}

export async function listExportRecords() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("export_records")
    .select("id,export_type,product_count,filename,download_url,status,error_message,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as ExportRecordView[];
}
