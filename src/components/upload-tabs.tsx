"use client";

import { useState } from "react";
import { UploadForm } from "@/components/upload-form";
import { WebScraper } from "@/components/web-scraper";

const TABS = [
  { key: "local", label: "本地上传" },
  { key: "web", label: "网页采集" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function UploadTabs() {
  const [active, setActive] = useState<TabKey>("local");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-md border border-zinc-200 bg-zinc-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              active === tab.key
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-600 hover:text-zinc-950"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "local" ? <UploadForm /> : <WebScraper />}
    </div>
  );
}
