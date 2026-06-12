"use client";

import { useState } from "react";

import { UploadForm, type UploadAssetSource } from "@/components/upload-form";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type UploadEntry = {
  source: UploadAssetSource;
  zh: string;
  en: string;
  descriptionZh: string;
  descriptionEn: string;
};

const UPLOAD_ENTRIES: UploadEntry[] = [
  {
    source: "upload_original",
    zh: "原图",
    en: "Original",
    descriptionZh: "商品图、衣服图、待处理原始素材。",
    descriptionEn: "Product photos, garment photos, and source images for processing.",
  },
  {
    source: "print_transparent",
    zh: "透明印花图",
    en: "Transparent Print",
    descriptionZh: "透明底 PNG/WEBP，优先作为可印刷图案素材。",
    descriptionEn: "Transparent PNG/WEBP print assets ready for POD workflows.",
  },
  {
    source: "garment_base",
    zh: "胚衣底图",
    en: "Blank Garment",
    descriptionZh: "空白衣服、底图、套图底板素材。",
    descriptionEn: "Blank garments, base photos, and mockup background assets.",
  },
];

export function UploadTabs() {
  const [activeSource, setActiveSource] = useState<UploadAssetSource>("upload_original");
  const { isDark, t, accent } = useSettings();
  const colors = ACCENT_COLORS[accent] ?? ACCENT_COLORS.cyan;
  const activeEntry = UPLOAD_ENTRIES.find((entry) => entry.source === activeSource) ?? UPLOAD_ENTRIES[0];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 lg:grid-cols-3" role="tablist" aria-label={t("素材类型", "Asset type")}>
        {UPLOAD_ENTRIES.map((entry) => {
          const isActive = entry.source === activeSource;

          return (
            <button
              key={entry.source}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSource(entry.source)}
              className={[
                "group rounded-[10px] border p-4 text-left transition-colors duration-150",
                isActive
                  ? isDark
                    ? "bg-white/[0.06]"
                    : "bg-black/[0.03]"
                  : isDark
                    ? "border-white/[0.08] bg-[#0f0f10] hover:border-white/[0.16] hover:bg-white/[0.03]"
                    : "border-black/[0.08] bg-white hover:border-black/[0.16] hover:bg-black/[0.02]",
              ].join(" ")}
              style={isActive ? { borderColor: colors.primary } : undefined}
            >
              <span
                className={[
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border text-[13px] font-semibold",
                  isDark ? "border-white/[0.08] bg-white/[0.04]" : "border-black/[0.08] bg-black/[0.03]",
                ].join(" ")}
                style={{ color: isActive ? colors.primary : undefined }}
              >
                {entry.zh.slice(0, 1)}
              </span>
              <span
                className={[
                  "mt-3 block text-sm font-semibold",
                  isDark ? "text-white" : "text-zinc-900",
                ].join(" ")}
              >
                {t(entry.zh, entry.en)}
              </span>
              <span
                className={[
                  "mt-1 block text-[13px] leading-relaxed",
                  isDark ? "text-zinc-500" : "text-zinc-500",
                ].join(" ")}
              >
                {t(entry.descriptionZh, entry.descriptionEn)}
              </span>
            </button>
          );
        })}
      </section>

      <UploadForm
        assetSource={activeEntry.source}
        titleZh={`${activeEntry.zh}上传`}
        titleEn={`${activeEntry.en} Upload`}
        descriptionZh={activeEntry.descriptionZh}
        descriptionEn={activeEntry.descriptionEn}
      />
    </div>
  );
}
