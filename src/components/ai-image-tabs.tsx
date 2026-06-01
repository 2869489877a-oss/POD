"use client";

import { type ReactNode, useState } from "react";

type Props = {
  generateTab: ReactNode;
  backgroundTab: ReactNode;
  patternTab: ReactNode;
};

const tabs = [
  { key: "generate", label: "自由生图" },
  { key: "background", label: "抠图换背景" },
  { key: "pattern", label: "AI 印花" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function AiImageTabs({ generateTab, backgroundTab, patternTab }: Props) {
  const [active, setActive] = useState<TabKey>("generate");

  return (
    <div>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={[
              "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all",
              active === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "generate" && generateTab}
      {active === "background" && backgroundTab}
      {active === "pattern" && patternTab}
    </div>
  );
}
