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
  { key: "generate", zh: "自由生图", en: "Generate" },
  { key: "background", zh: "抠图换背景", en: "Background" },
  { key: "extract", zh: "AI 抠印花", en: "Extract Print" },
  { key: "pattern", zh: "AI 生成印花", en: "Gen Pattern" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function AiImageTabs({ generateTab, backgroundTab, patternTab, extractTab }: Props) {
  const [active, setActive] = useState<TabKey>("generate");
  const { mode, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode === "dark";

  return (
    <div>
      <div className={`flex gap-1 rounded-xl p-1.5 mb-6 border ${isDark ? "bg-[#12122a] border-white/5" : "bg-slate-100 border-slate-200"}`}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
              active === tab.key
                ? `bg-gradient-to-r ${colors.gradient} text-white shadow-lg ${colors.shadow}`
                : `${isDark ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-700 hover:bg-white"}`,
            ].join(" ")}
          >
            {t(tab.zh, tab.en)}
          </button>
        ))}
      </div>

      <div className={`rounded-xl border p-6 ${isDark ? "border-white/5 bg-[#12122a]/50 backdrop-blur-sm" : "border-slate-200 bg-white"}`}>
        {active === "generate" && generateTab}
        {active === "background" && backgroundTab}
        {active === "extract" && extractTab}
        {active === "pattern" && patternTab}
      </div>
    </div>
  );
}
