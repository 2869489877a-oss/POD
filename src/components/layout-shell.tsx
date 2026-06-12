"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/sidebar";
import { useSettings } from "@/lib/settings/context";

/** Routes rendered full-bleed without the console sidebar */
const BARE_ROUTES = ["/", "/auth"];

export function LayoutShell({ children }: { children: ReactNode }) {
  const { isDark } = useSettings();
  const pathname = usePathname();

  const isBare =
    pathname === "/" || BARE_ROUTES.some((r) => r !== "/" && pathname.startsWith(r));

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <div
      className={
        isDark
          ? "flex min-h-screen bg-[#0a0a0a] text-[#ededed]"
          : "flex min-h-screen bg-[#fafafa] text-zinc-900"
      }
    >
      <Sidebar />
      <main className="pod-content min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">{children}</div>
      </main>
    </div>
  );
}
