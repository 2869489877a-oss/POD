import path from "path";

import { ImageCollectorPluginGuide } from "@/components/image-collector-plugin-guide";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function ImageCollectorPage() {
  const extensionPath = path.join(process.cwd(), "browser-extensions", "pod-image-collector");

  return (
    <PageShell
      titleZh="图片采集插件说明"
      titleEn="Image Collector Plugin Guide"
      descriptionZh="通过 Chrome / Microsoft Edge 浏览器插件采集商品图；旧模板管理入口已隐藏。"
      descriptionEn="Collect product images through the Chrome / Microsoft Edge browser extension. The old template manager UI is hidden."
    >
      <ImageCollectorPluginGuide extensionPath={extensionPath} />
    </PageShell>
  );
}
