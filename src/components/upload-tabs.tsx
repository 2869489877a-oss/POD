"use client";

import { useState } from "react";

import { UploadForm, type UploadAssetSource } from "@/components/upload-form";
import { useSettings } from "@/lib/settings/context";

type UploadEntry = {
  source: UploadAssetSource;
  zh: string;
  en: string;
  descriptionZh: string;
  descriptionEn: string;
  accent: string;
};

const UPLOAD_ENTRIES: UploadEntry[] = [
  {
    source: "upload_original",
    zh: "原图",
    en: "Original",
    descriptionZh: "商品图、衣服图、待处理原始素材。",
    descriptionEn: "Product photos, garment photos, and source images for processing.",
    accent: "from-sky-500 to-cyan-500",
  },
  {
    source: "print_transparent",
    zh: "透明印花图",
    en: "Transparent Print",
    descriptionZh: "透明底 PNG/WEBP，优先作为可印刷图案素材。",
    descriptionEn: "Transparent PNG/WEBP print assets ready for POD workflows.",
    accent: "from-emerald-500 to-teal-500",
  },
  {
    source: "garment_base",
    zh: "胚衣底图",
    en: "Blank Garment",
    descriptionZh: "空白衣服、底图、套图底板素材。",
    descriptionEn: "Blank garments, base photos, and mockup background assets.",
    accent: "from-amber-500 to-orange-500",
  },
];

export function UploadTabs() {
  const [activeSource, setActiveSource] = useState<UploadAssetSource>("upload_original");
  const { isDark, t } = useSettings();
  const activeEntry = UPLOAD_ENTRIES.find((entry) => entry.source === activeSource) ?? UPLOAD_ENTRIES[0];

  return (
    <div className="space-y-6">
      <section
        className={[
          "grid gap-3 rounded-2xl border p-3 shadow-sm lg:grid-cols-3",
          isDark
            ? "border-white/10 bg-white/[0.04] shadow-black/20"
            : "border-slate-200 bg-white shadow-slate-200/60",
        ].join(" ")}
      >
        {UPLOAD_ENTRIES.map((entry) => {
          const isActive = entry.source === activeSource;

          return (
            <button
              key={entry.source}
              type="button"
              onClick={() => setActiveSource(entry.source)}
              className={[
                "group rounded-xl border p-4 text-left transition duration-200",
                isActive
                  ? "border-transparent bg-gradient-to-br text-white shadow-xl shadow-emerald-500/20"
                  : isDark
                    ? "border-white/10 bg-slate-950/20 text-slate-200 hover:border-emerald-400/40 hover:bg-white/[0.06]"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-300 hover:bg-white",
                isActive ? entry.accent : "",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black",
                  isActive
                    ? "bg-white/20 text-white"
                    : isDark
                      ? "bg-white/[0.08] text-emerald-300"
                      : "bg-white text-emerald-700",
                ].join(" ")}
              >
                {entry.zh.slice(0, 1)}
              </span>
              <span className="mt-3 block text-base font-black">{t(entry.zh, entry.en)}</span>
              <span className={["mt-1 block text-sm leading-6", isActive ? "text-white/80" : "text-slate-500"].join(" ")}>
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
