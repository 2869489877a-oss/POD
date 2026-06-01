import "server-only";

import ExcelJS from "exceljs";

import { getProductImageUrls } from "@/lib/exports/products";
import type { ProductDraftView } from "@/lib/products/types";

export async function buildProductsWorkbook(products: ProductDraftView[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "POD Batch System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Products");
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns = [
    { header: "SKU", key: "sku", width: 24 },
    { header: "Title", key: "title", width: 42 },
    { header: "Description", key: "description", width: 60 },
    { header: "Tags", key: "tags", width: 42 },
    { header: "Bullet Points", key: "bullet_points", width: 52 },
    { header: "Product Type", key: "product_type", width: 24 },
    { header: "Price", key: "price", width: 12 },
    { header: "Main Image", key: "main_image", width: 64 },
    { header: "Gallery Images", key: "gallery_images", width: 64 },
  ];

  for (const product of products) {
    const images = getProductImageUrls(product);

    worksheet.addRow({
      bullet_points: product.bullet_points.join("\n"),
      description: product.description ?? "",
      gallery_images: images.slice(1).join("\n"),
      main_image: images[0] ?? "",
      price: product.price ?? "",
      product_type: product.product_type ?? "",
      sku: product.sku ?? "",
      tags: product.tags.join(", "),
      title: product.title ?? "",
    });
  }

  worksheet.getRow(1).font = { bold: true };
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
