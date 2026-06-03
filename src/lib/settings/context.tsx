"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "day" | "night";
export type Language = "zh" | "en";
export type AccentColor = "violet" | "blue" | "emerald" | "rose" | "amber" | "cyan";

export type AppSettings = {
  appearanceVersion: number;
  mode: ThemeMode;
  language: Language;
  accent: AccentColor;
};

type SettingsContextValue = AppSettings & {
  setMode: (mode: ThemeMode) => void;
  setLanguage: (lang: Language) => void;
  setAccent: (color: AccentColor) => void;
  t: (zh: string, en: string) => string;
  isDark: boolean;
};

const defaults: AppSettings = { appearanceVersion: 3, mode: "night", language: "zh", accent: "cyan" };

const SettingsContext = createContext<SettingsContextValue>({
  ...defaults,
  setMode: () => {},
  setLanguage: () => {},
  setAccent: () => {},
  t: (zh) => zh,
  isDark: true,
});

export function useSettings() {
  return useContext(SettingsContext);
}

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem("pod-settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      const next = { ...defaults, ...parsed };
      if ((next.appearanceVersion ?? 0) < 3) {
        next.mode = "night";
        next.accent = "cyan";
        next.appearanceVersion = 3;
      }
      if (!["day", "night"].includes(next.mode)) next.mode = "night";
      return next;
    }
  } catch { /* ignore */ }
  return defaults;
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem("pod-settings", JSON.stringify(settings));
  } catch { /* ignore */ }
}

export const ACCENT_COLORS: Record<AccentColor, { label: string; labelEn: string; primary: string; gradient: string; shadow: string; border: string; ring: string; glow: string }> = {
  violet: { label: "紫色", labelEn: "Violet", primary: "#8b5cf6", gradient: "from-violet-500 to-purple-600", shadow: "shadow-violet-500/20", border: "border-violet-500/20", ring: "ring-violet-500", glow: "rgba(139,92,246,0.4)" },
  blue: { label: "蓝色", labelEn: "Blue", primary: "#3b82f6", gradient: "from-blue-500 to-indigo-600", shadow: "shadow-blue-500/20", border: "border-blue-500/20", ring: "ring-blue-500", glow: "rgba(59,130,246,0.4)" },
  emerald: { label: "绿色", labelEn: "Emerald", primary: "#10b981", gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-500/20", border: "border-emerald-500/20", ring: "ring-emerald-500", glow: "rgba(16,185,129,0.4)" },
  rose: { label: "粉色", labelEn: "Rose", primary: "#f43f5e", gradient: "from-rose-500 to-pink-600", shadow: "shadow-rose-500/20", border: "border-rose-500/20", ring: "ring-rose-500", glow: "rgba(244,63,94,0.4)" },
  amber: { label: "橙色", labelEn: "Amber", primary: "#f59e0b", gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-500/20", border: "border-amber-500/20", ring: "ring-amber-500", glow: "rgba(245,158,11,0.4)" },
  cyan: { label: "青色", labelEn: "Cyan", primary: "#06b6d4", gradient: "from-cyan-500 to-blue-600", shadow: "shadow-cyan-500/20", border: "border-cyan-500/20", ring: "ring-cyan-500", glow: "rgba(6,182,212,0.4)" },
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(loadSettings());
      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    saveSettings(settings);
    document.documentElement.setAttribute("data-mode", settings.mode);
    document.documentElement.setAttribute("data-accent", settings.accent);
  }, [settings, mounted]);

  function setMode(mode: ThemeMode) { setSettings((s) => ({ ...s, appearanceVersion: defaults.appearanceVersion, mode })); }
  function setLanguage(language: Language) { setSettings((s) => ({ ...s, language })); }
  function setAccent(accent: AccentColor) { setSettings((s) => ({ ...s, accent })); }
  function t(zh: string, en: string) { return settings.language === "zh" ? zh : en; }

  const isDark = settings.mode === "night";

  return (
    <SettingsContext.Provider value={{ ...settings, setMode, setLanguage, setAccent, t, isDark }}>
      {children}
    </SettingsContext.Provider>
  );
}
