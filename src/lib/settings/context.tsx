"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";
export type Language = "zh" | "en";
export type AccentColor = "violet" | "blue" | "emerald" | "rose" | "amber" | "cyan";

export type AppSettings = {
  mode: ThemeMode;
  language: Language;
  accent: AccentColor;
};

type SettingsContextValue = AppSettings & {
  setMode: (mode: ThemeMode) => void;
  setLanguage: (lang: Language) => void;
  setAccent: (color: AccentColor) => void;
  t: (zh: string, en: string) => string;
};

const defaults: AppSettings = { mode: "dark", language: "zh", accent: "violet" };

const SettingsContext = createContext<SettingsContextValue>({
  ...defaults,
  setMode: () => {},
  setLanguage: () => {},
  setAccent: () => {},
  t: (zh) => zh,
});

export function useSettings() {
  return useContext(SettingsContext);
}

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem("pod-settings");
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem("pod-settings", JSON.stringify(settings));
  } catch { /* ignore */ }
}

export const ACCENT_COLORS: Record<AccentColor, { label: string; primary: string; gradient: string; shadow: string; border: string; ring: string }> = {
  violet: { label: "紫色", primary: "#8b5cf6", gradient: "from-violet-600 to-cyan-600", shadow: "shadow-violet-500/25", border: "border-violet-500/20", ring: "ring-violet-500" },
  blue: { label: "蓝色", primary: "#3b82f6", gradient: "from-blue-600 to-indigo-600", shadow: "shadow-blue-500/25", border: "border-blue-500/20", ring: "ring-blue-500" },
  emerald: { label: "绿色", primary: "#10b981", gradient: "from-emerald-600 to-teal-600", shadow: "shadow-emerald-500/25", border: "border-emerald-500/20", ring: "ring-emerald-500" },
  rose: { label: "粉色", primary: "#f43f5e", gradient: "from-rose-600 to-pink-600", shadow: "shadow-rose-500/25", border: "border-rose-500/20", ring: "ring-rose-500" },
  amber: { label: "橙色", primary: "#f59e0b", gradient: "from-amber-500 to-orange-600", shadow: "shadow-amber-500/25", border: "border-amber-500/20", ring: "ring-amber-500" },
  cyan: { label: "青色", primary: "#06b6d4", gradient: "from-cyan-600 to-teal-600", shadow: "shadow-cyan-500/25", border: "border-cyan-500/20", ring: "ring-cyan-500" },
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

  function setMode(mode: ThemeMode) { setSettings((s) => ({ ...s, mode })); }
  function setLanguage(language: Language) { setSettings((s) => ({ ...s, language })); }
  function setAccent(accent: AccentColor) { setSettings((s) => ({ ...s, accent })); }
  function t(zh: string, en: string) { return settings.language === "zh" ? zh : en; }

  return (
    <SettingsContext.Provider value={{ ...settings, setMode, setLanguage, setAccent, t }}>
      {children}
    </SettingsContext.Provider>
  );
}
