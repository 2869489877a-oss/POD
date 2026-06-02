import { PageShell } from "@/components/page-shell";
import { UploadTabs } from "@/components/upload-tabs";

export default function UploadPage() {
  return (
    <PageShell
      titleZh="上传图片"
      titleEn="Upload Images"
      descriptionZh="上传本地图片或从网页采集商品图。"
      descriptionEn="Upload local images or collect product images from web pages."
    >
      <UploadTabs />
    </PageShell>
  );
}
