"use client";

import { type ReactNode, useState } from "react";

type Props = {
  generateTab: ReactNode;
  backgroundTab: ReactNode;
  patternTab: ReactNode;
  extractTab: ReactNode;
};

const tabs = [
  { key: "generate", label: "自由生图" },
  { key: "background", label: "抠图换背景" },
  { key: "extract", label: "AI 抠印花" },
  { key: "pattern", label: "AI 生成印花" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function AiImageTabs({ generateTab, backgroundTab, patternTab, extractTab }: Props) {
  const [active, setActive] = useState<TabKey>("generate");

  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-[#12122a] p-1.5 mb-6 border border-violet-500/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
              active === tab.key
                ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/20"
                : "text-slate-400 hover:text-white hover:bg-white/5",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-violet-500/10 bg-[#12122a]/50 p-6 backdrop-blur-sm">
        {active === "generate" && generateTab}
        {active === "background" && backgroundTab}
        {active === "extract" && extractTab}
        {active === "pattern" && patternTab}
      </div>
    </div>
  );
}
