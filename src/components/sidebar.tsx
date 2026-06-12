"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems, navGroups } from "@/lib/navigation";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type SidebarProvider = {
  id: string;
  display_name: string;
  model_id: string;
  is_active: boolean;
  priority: number;
};

export function Sidebar() {
  const pathname = usePathname();
  const { accent, isDark, t } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const [providers, setProviders] = useState<SidebarProvider[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentModel() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (!cancelled) setProviders(data.providers ?? []);
      } catch {
        if (!cancelled) setProviders([]);
      }
    }

    void loadCurrentModel();
    window.addEventListener("pod-ai-providers-updated", loadCurrentModel);
    return () => {
      cancelled = true;
      window.removeEventListener("pod-ai-providers-updated", loadCurrentModel);
    };
  }, []);

  const currentProvider = useMemo(() => {
    return providers
      .filter((provider) => provider.is_active)
      .sort((a, b) => b.priority - a.priority)[0] ?? null;
  }, [providers]);

  return (
    <aside
      className={[
        "sticky top-0 flex h-screen w-[240px] shrink-0 flex-col",
        isDark
          ? "border-r border-white/[0.08] bg-[#0a0a0a]"
          : "border-r border-black/[0.08] bg-[#fafafa]",
      ].join(" ")}
    >
      {/* Brand */}
      <div className={`flex h-14 items-center gap-2.5 border-b px-4 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: colors.primary }}
        >
          <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className={`truncate text-[13px] font-semibold leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
            {t("POD 批处理", "POD Batch")}
          </h1>
          <p className={`text-[10px] leading-tight ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Internal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {/* Home link */}
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={[
            "group mb-3 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
            pathname === "/"
              ? isDark
                ? "bg-white/[0.08] font-medium text-white"
                : "bg-black/[0.06] font-medium text-zinc-900"
              : isDark
                ? "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                : "text-zinc-500 hover:bg-black/[0.04] hover:text-zinc-900",
          ].join(" ")}
        >
          <svg
            className="h-4 w-4 shrink-0"
            style={{ color: pathname === "/" ? colors.primary : undefined }}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
            />
          </svg>
          <span className="truncate">{t("工作台首页", "Home")}</span>
        </Link>

        {navGroups.map((group) => {
          const groupItems = group.hrefs
            .map((href) => navItems.find((item) => item.href === href))
            .filter((item): item is (typeof navItems)[number] => Boolean(item));

          if (groupItems.length === 0) return null;

          return (
            <div key={group.labelZh} className="mb-3">
              <p
                className={`px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] ${
                  isDark ? "text-zinc-600" : "text-zinc-400"
                }`}
              >
                {t(group.labelZh, group.labelEn)}
              </p>
              <ul className="flex flex-col gap-px">
                {groupItems.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={[
                          "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                          isActive
                            ? isDark
                              ? "bg-white/[0.08] font-medium text-white"
                              : "bg-black/[0.06] font-medium text-zinc-900"
                            : isDark
                              ? "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                              : "text-zinc-500 hover:bg-black/[0.04] hover:text-zinc-900",
                        ].join(" ")}
                      >
                        <svg
                          className="h-4 w-4 shrink-0 transition-colors duration-150"
                          style={{ color: isActive ? colors.primary : undefined }}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        <span className="truncate">{t(item.titleZh, item.titleEn)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className={`border-t px-4 py-3 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <p className={`text-[11px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
            {t("系统运行中", "All systems normal")}
          </p>
        </div>
        <div className="mt-2">
          <p className={`text-[10px] uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {t("默认模型", "Default Model")}
          </p>
          <p
            className={`mt-0.5 truncate font-mono text-[11px] ${
              currentProvider
                ? isDark ? "text-zinc-300" : "text-zinc-700"
                : isDark ? "text-zinc-600" : "text-zinc-400"
            }`}
            title={currentProvider ? `${currentProvider.display_name} / ${currentProvider.model_id}` : undefined}
          >
            {currentProvider ? currentProvider.model_id : t("暂无启用模型", "No active model")}
          </p>
        </div>
      </div>
    </aside>
  );
}
