import { ExportsManager } from "@/components/exports-manager";
import { PageShell } from "@/components/page-shell";
import { listExportableProducts } from "@/lib/exports/products";
import { listExportRecords } from "@/lib/exports/records";

export const dynamic = "force-dynamic";

async function getInitialData() {
  try {
    const [products, exportRecords] = await Promise.all([
      listExportableProducts(),
      listExportRecords(),
    ]);

    return {
      exportRecords,
      error: null,
      products,
    };
  } catch (error) {
    return {
      exportRecords: [],
      error: error instanceof Error ? error.message : "读取可导出商品失败",
      products: [],
    };
  }
}

export default async function ExportsPage() {
  const { error, exportRecords, products } = await getInitialData();

  return (
    <PageShell
      titleZh="导出中心"
      titleEn="Export Center"
      descriptionZh="选择商品草稿导出 Excel 或图片 ZIP。"
      descriptionEn="Select product drafts and export Excel files or image ZIP packages."
    >
      <ExportsManager exportRecords={exportRecords} initialError={error} products={products} />
    </PageShell>
  );
}
