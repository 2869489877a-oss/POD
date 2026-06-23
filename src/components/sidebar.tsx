"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems, navGroups } from "@/lib/navigation";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { useAuth } from "@/lib/auth/context";
import { BrandLogo } from "@/components/brand-logo";

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
  const { profile, isAdmin, signOut } = useAuth();
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
        <BrandLogo size={28} />
        <div className="min-w-0">
          <h1 className={`truncate text-[13px] font-semibold leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 bg-clip-text font-bold text-transparent">POD</span>
            {t(" 批处理", " Batch")}
          </h1>
          <p className={`text-[10px] leading-tight ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Internal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group) => {
          const groupItems = group.hrefs
            .map((href) => navItems.find((item) => item.href === href))
            .filter((item): item is (typeof navItems)[number] => Boolean(item))
            .filter((item) => !item.adminOnly || isAdmin);

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
                          "ui-press group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-[background-color,color,transform] duration-150 hover:translate-x-0.5",
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
        {isAdmin ? (
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
        ) : null}

        {/* Current user */}
        {profile ? (
          <div className={`mt-3 flex items-center justify-between gap-2 border-t pt-3 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: colors.primary }}
              >
                {(profile.display_name || profile.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className={`truncate text-[12px] font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  {profile.display_name || profile.email}
                </p>
                <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                  {profile.role === "admin" ? t("管理员", "Admin") : t("员工", "Employee")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              title={t("退出登录", "Sign out")}
              className={`ui-press shrink-0 rounded-md p-1.5 transition-colors ${
                isDark
                  ? "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                  : "text-zinc-400 hover:bg-black/[0.04] hover:text-zinc-700"
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                />
              </svg>
              <span className="sr-only">{t("退出登录", "Sign out")}</span>
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
