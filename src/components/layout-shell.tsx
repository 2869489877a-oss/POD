"use client";

import type { ReactNode } from "react";
import { useSettings } from "@/lib/settings/context";

export function LayoutShell({ children }: { children: ReactNode }) {
  const { mode } = useSettings();

  return (
    <div className={`flex min-h-screen ${mode === "dark" ? "bg-[#0a0a1a] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {children}
    </div>
  );
}
