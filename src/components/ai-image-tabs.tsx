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
  const { mode, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isPremium = mode === "premium";
  const isDark = mode !== "light";

  return (
    <div>
      <div
        className={
          isPremium
            ? "mb-5 grid grid-cols-2 gap-2 rounded-[23px] border border-white/10 bg-white/[0.055] p-2 shadow-[0_20px_58px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:grid-cols-4"
            : `flex gap-1 rounded-xl p-1.5 mb-6 border ${isDark ? "bg-[#12122a] border-white/5" : "bg-slate-100 border-slate-200"}`
        }
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              isPremium
                ? "min-h-12 rounded-[17px] px-4 py-3 text-sm font-black transition-all duration-200"
                : "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
              isPremium
                ? active === tab.key
                  ? "bg-gradient-to-r from-emerald-300 to-cyan-300 text-slate-950 shadow-[0_16px_40px_rgba(32,227,162,0.24)]"
                  : "text-slate-400 hover:bg-white/[0.055] hover:text-white"
                : active === tab.key
                  ? `bg-gradient-to-r ${colors.gradient} text-white shadow-lg ${colors.shadow}`
                  : `${isDark ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-700 hover:bg-white"}`,
            ].join(" ")}
          >
            {t(tab.zh, tab.en)}
          </button>
        ))}
      </div>

      <div
        className={
          isPremium
            ? "rounded-[28px] border border-white/10 bg-slate-950/45 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl"
            : `rounded-xl border p-6 ${isDark ? "border-white/5 bg-[#12122a]/50 backdrop-blur-sm" : "border-slate-200 bg-white"}`
        }
      >
        {active === "generate" && generateTab}
        {active === "background" && backgroundTab}
        {active === "extract" && extractTab}
        {active === "pattern" && patternTab}
      </div>
    </div>
  );
}
