import { PageShell } from "@/components/page-shell";
import { UploadTabs } from "@/components/upload-tabs";

export default function UploadPage() {
  return (
    <PageShell title="上传图片" description="上传本地图片或从网页采集商品图。">
      <UploadTabs />
    </PageShell>
  );
}
