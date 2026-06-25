import { NextResponse } from "next/server";

import {
  sanitizeFileSegment,
  writePublicExportFile,
} from "@/lib/exports/files";
import { buildSingleProductImagesZip } from "@/lib/exports/images-zip";
import { getProductsByIds } from "@/lib/exports/products";
import { createExportRecord } from "@/lib/exports/records";

export const runtime = "nodejs";

function getProductId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const productsIndex = segments.indexOf("products");
  return productsIndex >= 0 ? decodeURIComponent(segments[productsIndex + 1] ?? "") : "";
}

function isPendingStatusSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("export_records_status_check") ||
    message.includes("violates check constraint")
  );
}

export async function POST(request: Request) {
  const productId = getProductId(request);

  if (!productId) {
    return NextResponse.json({ error: "缺少商品草稿 ID" }, { status: 400 });
  }

  try {
    const products = await getProductsByIds([productId], { requireExportable: false });
    const product = products[0];

    if (!product) {
      throw new Error("商品草稿不存在，请刷新后重试");
    }

    try {
      const record = await createExportRecord({
        exportType: "images_zip",
        productCount: products.length,
        productIds: products.map((product) => product.id),
        status: "pending",
      });

      return NextResponse.json({
        count: products.length,
        message: "商品套图 ZIP 已进入后台队列，请稍等生成完成。",
        queued: true,
        record,
        record_id: record.id,
      });
    } catch (queueError) {
      if (!isPendingStatusSchemaError(queueError)) {
        throw queueError;
      }
    }

    const archive = await buildSingleProductImagesZip(product);
    const filename = `${sanitizeFileSegment(product.sku, product.id)}.zip`;
    const { downloadUrl } = await writePublicExportFile(filename, archive);
    const record = await createExportRecord({
      downloadUrl,
      exportType: "images_zip",
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
    const errorMessage = error instanceof Error ? error.message : "下载商品套图失败";
    const status = errorMessage.includes("没有图片") ? 400 : 500;

    try {
      await createExportRecord({
        errorMessage,
        exportType: "images_zip",
        productCount: productId ? 1 : 0,
        productIds: productId ? [productId] : [],
        status: "failed",
      });
    } catch {
      // Keep the response focused on the download failure.
    }

    return NextResponse.json({ error: errorMessage }, { status });
  }
}
