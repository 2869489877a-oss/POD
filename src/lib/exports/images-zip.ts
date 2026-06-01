import "server-only";

import JSZip from "jszip";
import sharp from "sharp";

import {
  inferImageExtension,
  sanitizeFileSegment,
} from "@/lib/exports/files";
import { getProductImageUrls } from "@/lib/exports/products";
import type { ProductDraftView } from "@/lib/products/types";

async function downloadImage(url: string) {
  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error(`图片下载失败：${url}`);
  }

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}，${url}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    extension: inferImageExtension(url, response.headers.get("content-type")),
  };
}

function orderedImageName(index: number) {
  const label = index === 0 ? "main" : index === 1 ? "gallery" : "detail";
  return `${String(index + 1).padStart(2, "0")}-${label}.jpg`;
}

async function buildJpegImage(url: string) {
  const image = await downloadImage(url);

  return sharp(image.buffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function buildOrderedImagesZip(
  imageUrls: string[],
  options: { emptyMessage: string },
) {
  const urls = Array.from(new Set(imageUrls.filter(Boolean)));

  if (urls.length === 0) {
    throw new Error(options.emptyMessage);
  }

  const zip = new JSZip();

  for (const [index, imageUrl] of urls.entries()) {
    const image = await buildJpegImage(imageUrl);
    zip.file(orderedImageName(index), image);
  }

  return zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });
}

export async function buildSingleProductImagesZip(product: ProductDraftView) {
  return buildOrderedImagesZip(getProductImageUrls(product), {
    emptyMessage: `商品 ${product.sku || product.id} 没有图片，无法下载`,
  });
}

export async function buildProductImagesZip(products: ProductDraftView[]) {
  const zip = new JSZip();
  const folderCounts = new Map<string, number>();

  for (const product of products) {
    const skuFolder = sanitizeFileSegment(product.sku, product.id);
    const currentCount = (folderCounts.get(skuFolder) ?? 0) + 1;
    folderCounts.set(skuFolder, currentCount);

    const folderName = currentCount === 1 ? skuFolder : `${skuFolder}-${currentCount}`;
    const folder = zip.folder(folderName);

    if (!folder) {
      throw new Error(`创建 ZIP 文件夹失败：${folderName}`);
    }

    const imageUrls = getProductImageUrls(product);

    if (imageUrls.length === 0) {
      throw new Error(`商品 ${product.sku || product.id} 没有可导出的图片`);
    }

    for (const [index, imageUrl] of imageUrls.entries()) {
      const image = await downloadImage(imageUrl);
      const imageName = `${String(index + 1).padStart(2, "0")}${image.extension}`;
      folder.file(imageName, image.buffer);
    }
  }

  return zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });
}
