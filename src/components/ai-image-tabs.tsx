"use client";

import { type ReactNode, useState } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type Props = {
  generateTab: ReactNode;
  backgroundTab: ReactNode;
  patternTab: ReactNode;
  extractTab: ReactNode;
};

const tabs = [
  { key: "generate", zh: "文生图", en: "Text to Image" },
  { key: "background", zh: "图生图(AI提取印花)", en: "AI Print Extract" },
  { key: "extract", zh: "印花图换底", en: "Transparent Print" },
  { key: "pattern", zh: "AI 生成印花", en: "Gen Pattern" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function AiImageTabs({ generateTab, backgroundTab, patternTab, extractTab }: Props) {
  const [active, setActive] = useState<TabKey>("generate");
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  return (
    <div>
      <div
        className={`mb-5 grid grid-cols-2 gap-2 rounded-[20px] border p-2 backdrop-blur-xl lg:grid-cols-4 ${
          isDark
            ? "border-white/[0.08] bg-white/[0.04]"
            : "border-black/[0.05] bg-white/80"
        }`}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              "rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-all duration-200",
              active === tab.key
                ? `bg-gradient-to-r ${colors.gradient} text-white shadow-lg ${colors.shadow}`
                : isDark
                  ? "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                  : "text-slate-500 hover:bg-black/[0.03] hover:text-slate-700",
            ].join(" ")}
          >
            {t(tab.zh, tab.en)}
          </button>
        ))}
      </div>

      <div
        className={`rounded-[20px] border p-6 backdrop-blur-xl ${
          isDark
            ? "border-white/[0.08] bg-white/[0.03]"
            : "border-black/[0.05] bg-white/70"
        }`}
      >
        {active === "generate" && generateTab}
        {active === "background" && backgroundTab}
        {active === "extract" && extractTab}
        {active === "pattern" && patternTab}
      </div>
    </div>
  );
}
