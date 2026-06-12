import { PageShell } from "@/components/page-shell";
import { UploadTabs } from "@/components/upload-tabs";

export default function UploadPage() {
  return (
    <PageShell
      titleZh="上传图片"
      titleEn="Upload Images"
      descriptionZh="按素材用途上传本地图片，并自动打分类标记，方便素材库筛选。"
      descriptionEn="Upload local images by asset purpose. Each upload is tagged for easier asset filtering."
    >
      <UploadTabs />
    </PageShell>
  );
}
