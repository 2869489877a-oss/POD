import { NextResponse } from "next/server";

import { buildProductsWorkbook } from "@/lib/exports/excel";
import {
  createExportFilename,
  writePublicExportFile,
} from "@/lib/exports/files";
import { getExportProductsByIds } from "@/lib/exports/products";
import { createExportRecord, idsFromUnknown } from "@/lib/exports/records";

export const runtime = "nodejs";

type ExportRequest = {
  product_ids?: unknown;
};

export async function POST(request: Request) {
  let body: ExportRequest;

  try {
    body = (await request.json()) as ExportRequest;
  } catch {
    return NextResponse.json({ error: "无法读取导出参数" }, { status: 400 });
  }

  try {
    const products = await getExportProductsByIds(body.product_ids);
    const workbook = await buildProductsWorkbook(products);
    const filename = createExportFilename("products", "xlsx");
    const { downloadUrl } = await writePublicExportFile(filename, workbook);
    const record = await createExportRecord({
      downloadUrl,
      exportType: "excel",
      filename,
      productCount: products.length,
      productIds: products.map((product) => product.id),
      status: "completed",
    });

    return NextResponse.json({
      count: products.length,
      download_url: downloadUrl,
      filename,
      record,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "导出 Excel 失败";

    try {
      const productIds = idsFromUnknown(body.product_ids);
      await createExportRecord({
        errorMessage,
        exportType: "excel",
        productCount: productIds.length,
        productIds,
        status: "failed",
      });
    } catch {
      // Keep the response focused on the export failure.
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 },
    );
  }
}
