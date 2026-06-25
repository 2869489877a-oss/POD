"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/lib/auth/context";
import { navGroups, navItems } from "@/lib/navigation";
import { ACCENT_COLORS, useSettings } from "@/lib/settings/context";

type SidebarProvider = {
  id: string;
  display_name: string;
  model_id: string;
  is_active: boolean;
  priority: number;
};

type MenuIconName = "logout" | "settings" | "users";

export function Sidebar() {
  const pathname = usePathname();
  const { accent, isDark, t } = useSettings();
  const { profile, isAdmin, signOut } = useAuth();
  const colors = ACCENT_COLORS[accent];
  const [providers, setProviders] = useState<SidebarProvider[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const timer = window.setTimeout(() => setUserMenuOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  const currentProvider = useMemo(() => {
    return providers
      .filter((provider) => provider.is_active)
      .sort((a, b) => b.priority - a.priority)[0] ?? null;
  }, [providers]);

  const profileLabel = profile ? profile.display_name || profile.email : "";
  const profileInitial = profileLabel.slice(0, 1).toUpperCase();

  return (
    <aside
      className={[
        "ui-sidebar relative z-20 flex h-screen w-[256px] shrink-0 flex-col",
        isDark
          ? "border-r border-white/[0.08] bg-[#07090b]/96"
          : "border-r border-black/[0.08] bg-white/92",
      ].join(" ")}
    >
      <div className={`flex h-16 shrink-0 items-center gap-3 border-b px-4 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
        <BrandLogo size={32} />
        <div className="min-w-0">
          <h1 className={`ui-sidebar-title truncate text-[15px] font-semibold leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
            <span className="pod-wordmark bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 bg-clip-text font-bold text-transparent">POD</span>
            {t(" 批处理", " Batch")}
          </h1>
          <p className={`ui-sidebar-subtitle text-[11px] leading-tight ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Internal</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3.5">
        {navGroups.map((group) => {
          const groupItems = group.hrefs
            .map((href) => navItems.find((item) => item.href === href))
            .filter((item): item is (typeof navItems)[number] => Boolean(item))
            .filter((item) => !item.adminOnly || isAdmin);

          if (groupItems.length === 0) return null;

          return (
            <div key={group.labelZh} className="mb-3.5">
              <p className={`ui-sidebar-section-label px-3 pb-1.5 pt-1.5 text-[11px] font-semibold ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                {t(group.labelZh, group.labelEn)}
              </p>
              <ul className="flex flex-col gap-1">
                {groupItems.map((item) => {
                  const isActive = pathname === item.href;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={[
                          "ui-sidebar-link ui-press group flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-[background-color,color,transform] duration-150 hover:translate-x-0.5",
                          isActive ? "ui-nav-current" : "",
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
                          className="h-[18px] w-[18px] shrink-0 transition-colors duration-150"
                          style={{ color: isActive ? colors.primary : undefined }}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        <span className="ui-sidebar-link-label truncate">{t(item.titleZh, item.titleEn)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={`shrink-0 border-t px-4 py-3.5 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <p className={`text-[12px] font-medium ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
            {t("系统运行中", "All systems normal")}
          </p>
        </div>

        {isAdmin ? (
          <div className="mt-2">
            <p className={`text-[11px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {t("默认模型", "Default Model")}
            </p>
            <p
              className={`mt-0.5 truncate font-mono text-[12px] ${
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

        {profile ? (
          <div
            ref={userMenuRef}
            className={`relative mt-3 border-t pt-3 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}
          >
            {userMenuOpen ? (
              <div
                className={[
                  "ui-enter ui-hover-sheen absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border p-2 shadow-2xl backdrop-blur-xl",
                  isDark
                    ? "border-white/[0.1] bg-zinc-950/95 shadow-black/60"
                    : "border-black/[0.08] bg-white/95 shadow-black/15",
                ].join(" ")}
              >
                <div className={["mb-1 flex items-center gap-3 rounded-lg px-2.5 py-2.5", isDark ? "bg-white/[0.04]" : "bg-black/[0.03]"].join(" ")}>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-lg"
                    style={{ background: colors.primary, boxShadow: `0 10px 28px ${colors.glow}` }}
                  >
                    {profileInitial}
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                      {profile.display_name || profile.email}
                    </p>
                    <p className={`truncate text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                      {profile.email}
                    </p>
                  </div>
                </div>

                <div className="space-y-1 py-1">
                  {isAdmin ? (
                    <SidebarMenuLink href="/account-management" icon="users" isDark={isDark} label={t("账号管理", "Account Management")} />
                  ) : null}
                  <SidebarMenuLink href="/settings" icon="settings" isDark={isDark} label={t("设置", "Settings")} />
                </div>

                <div className={`mt-1 border-t pt-1 ${isDark ? "border-white/[0.08]" : "border-black/[0.08]"}`}>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className={[
                      "ui-press flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                      isDark ? "text-red-300 hover:bg-red-500/10" : "text-red-600 hover:bg-red-50",
                    ].join(" ")}
                  >
                    <SidebarMenuIcon name="logout" className="h-4 w-4 shrink-0" />
                    <span>{t("退出登录", "Sign out")}</span>
                  </button>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
              className={[
                "ui-press ui-hover-sheen flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-all duration-200",
                userMenuOpen
                  ? isDark
                    ? "border-white/[0.18] bg-white/[0.08]"
                    : "border-black/[0.14] bg-white shadow-sm"
                  : isDark
                    ? "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.06]"
                    : "border-black/[0.06] bg-white/70 hover:border-black/[0.12] hover:bg-white",
              ].join(" ")}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white shadow-sm"
                style={{ background: colors.primary }}
              >
                {profileInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  {profile.display_name || profile.email}
                </p>
                <p className={`truncate text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {profile.role === "admin" ? t("管理员", "Admin") : t("员工", "Employee")}
                </p>
              </div>
              <svg
                className={[
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  userMenuOpen ? "rotate-180" : "",
                  isDark ? "text-zinc-500" : "text-zinc-400",
                ].join(" ")}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function SidebarMenuLink({
  href,
  icon,
  isDark,
  label,
}: {
  href: string;
  icon: "settings" | "users";
  isDark: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "ui-press flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
        isDark
          ? "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
          : "text-zinc-700 hover:bg-black/[0.04] hover:text-zinc-950",
      ].join(" ")}
    >
      <SidebarMenuIcon name={icon} className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function SidebarMenuIcon({
  className,
  name,
}: {
  className?: string;
  name: MenuIconName;
}) {
  const paths: Record<MenuIconName, string> = {
    logout: "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9",
    settings: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  };

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}
