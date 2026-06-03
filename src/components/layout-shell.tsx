"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { useSettings } from "@/lib/settings/context";

export function LayoutShell({ children }: { children: ReactNode }) {
  const { isDark } = useSettings();

  return (
    <div
      className={
        isDark
          ? "min-h-screen bg-[radial-gradient(ellipse_at_15%_15%,rgba(6,182,212,0.12),transparent_32%),radial-gradient(ellipse_at_85%_20%,rgba(99,102,241,0.09),transparent_28%),radial-gradient(ellipse_at_60%_90%,rgba(6,182,212,0.07),transparent_30%),linear-gradient(160deg,#060a11,#0c1222_40%,#0f172a)] p-3 text-slate-100"
          : "min-h-screen bg-[radial-gradient(ellipse_at_15%_15%,rgba(6,182,212,0.06),transparent_32%),radial-gradient(ellipse_at_85%_20%,rgba(99,102,241,0.05),transparent_28%),radial-gradient(ellipse_at_60%_90%,rgba(6,182,212,0.04),transparent_30%),linear-gradient(160deg,#f8fafc,#f1f5f9_40%,#e2e8f0)] p-3 text-slate-900"
      }
    >
      {/* Grid background */}
      <div
        className={`pointer-events-none fixed inset-0 ${
          isDark
            ? "bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:48px_48px]"
            : "bg-[linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[length:48px_48px]"
        } [mask-image:linear-gradient(to_bottom,transparent,#000_8%,#000_90%,transparent)]`}
      />

      <div className="relative z-10 flex min-h-[calc(100vh-1.5rem)] w-full gap-3">
        <Sidebar />
        <main
          className={
            isDark
              ? "min-w-0 flex-1 overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-7 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl"
              : "min-w-0 flex-1 overflow-hidden rounded-[24px] border border-black/[0.06] bg-white/70 px-7 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.06)] backdrop-blur-xl"
          }
        >
          <div className="mx-auto max-w-[1500px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
