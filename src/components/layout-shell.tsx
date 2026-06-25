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
          ? "ui-console-bg flex min-h-screen bg-[#07090b] text-[#ededed]"
          : "ui-console-bg flex min-h-screen bg-[#f6f8fb] text-zinc-900"
      }
    >
      <Sidebar />
      <main className="pod-content min-w-0 flex-1">
        <div
          key={pathname}
          className="ui-page-enter mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 md:px-8 lg:py-8 2xl:max-w-[1700px]"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
