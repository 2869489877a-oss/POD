"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { useSettings } from "@/lib/settings/context";

export function LayoutShell({ children }: { children: ReactNode }) {
  const { mode } = useSettings();
  const isPremium = mode === "premium";

  return (
    <div
      className={
        isPremium
          ? "min-h-screen bg-[radial-gradient(circle_at_18%_18%,rgba(32,227,162,0.16),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(246,198,106,0.13),transparent_28%),radial-gradient(circle_at_70%_92%,rgba(103,232,249,0.11),transparent_32%),linear-gradient(135deg,#060a11,#0d1320_42%,#101827)] p-4 text-slate-100"
          : `flex min-h-screen ${mode === "dark" ? "bg-[#0a0a1a] text-slate-100" : "bg-slate-50 text-slate-900"}`
      }
    >
      {isPremium && (
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:44px_44px] [mask-image:linear-gradient(to_bottom,transparent,#000_10%,#000_88%,transparent)]" />
      )}
      <div className={isPremium ? "relative z-10 flex min-h-[calc(100vh-2rem)] w-full gap-4" : "flex min-h-screen w-full"}>
        <Sidebar />
        <main
          className={
            isPremium
              ? "min-w-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] px-7 py-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl"
              : "min-w-0 flex-1 px-8 py-6"
          }
        >
          <div className={isPremium ? "mx-auto max-w-[1500px]" : "mx-auto max-w-7xl"}>{children}</div>
        </main>
      </div>
    </div>
  );
}
