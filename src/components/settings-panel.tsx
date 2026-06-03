"use client";

import { useSettings, ACCENT_COLORS, type AccentColor } from "@/lib/settings/context";

const ACCENT_OPTIONS: AccentColor[] = ["cyan", "violet", "blue", "emerald", "rose", "amber"];

export function SettingsPanel() {
  const { mode, language, accent, isDark, setMode, setLanguage, setAccent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  const cardClass = isDark
    ? "rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl"
    : "rounded-[20px] border border-black/[0.05] bg-white/80 p-6 backdrop-blur-xl";

  const sectionTitle = `text-sm font-bold mb-4 ${isDark ? "text-white" : "text-slate-900"}`;

  return (
    <div className="space-y-5">
      {/* Theme Mode — Day/Night */}
      <div className={cardClass}>
        <h4 className={sectionTitle}>{t("外观模式", "Appearance")}</h4>
        <div className="grid grid-cols-2 gap-3">
          <ModeCard
            active={mode === "night"}
            onClick={() => setMode("night")}
            isDark={isDark}
            accentColor={colors.primary}
            glow={colors.glow}
          >
            <div className="flex items-center gap-2.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
              <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
                {t("夜间模式", "Night Mode")}
              </span>
            </div>
            <p className={`mt-1.5 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {t("深色科技风，沉浸体验", "Dark tech style, immersive")}
            </p>
          </ModeCard>

          <ModeCard
            active={mode === "day"}
            onClick={() => setMode("day")}
            isDark={isDark}
            accentColor={colors.primary}
            glow={colors.glow}
          >
            <div className="flex items-center gap-2.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
              <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>
                {t("日间模式", "Day Mode")}
              </span>
            </div>
            <p className={`mt-1.5 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {t("明亮精致，清晰高效", "Bright and refined")}
            </p>
          </ModeCard>
        </div>
      </div>

      {/* Language */}
      <div className={cardClass}>
        <h4 className={sectionTitle}>{t("语言", "Language")}</h4>
        <div className="grid grid-cols-2 gap-3">
          <ModeCard active={language === "zh"} onClick={() => setLanguage("zh")} isDark={isDark} accentColor={colors.primary} glow={colors.glow}>
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>中文</span>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {t("简体中文界面", "Simplified Chinese")}
            </p>
          </ModeCard>
          <ModeCard active={language === "en"} onClick={() => setLanguage("en")} isDark={isDark} accentColor={colors.primary} glow={colors.glow}>
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-800"}`}>English</span>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              {t("英文界面", "English interface")}
            </p>
          </ModeCard>
        </div>
      </div>

      {/* Accent Color */}
      <div className={cardClass}>
        <h4 className={sectionTitle}>{t("主题颜色", "Accent Color")}</h4>
        <div className="grid grid-cols-3 gap-3">
          {ACCENT_OPTIONS.map((color) => {
            const c = ACCENT_COLORS[color];
            const isActive = accent === color;
            return (
              <button
                key={color}
                onClick={() => setAccent(color)}
                className={`group relative flex items-center gap-3 rounded-xl border p-3 transition-all duration-200 ${
                  isActive
                    ? "border-2"
                    : isDark
                      ? "border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]"
                      : "border-black/[0.05] hover:border-black/[0.1] hover:bg-black/[0.02]"
                }`}
                style={{
                  borderColor: isActive ? c.primary : undefined,
                  boxShadow: isActive ? `0 0 20px ${c.glow}` : undefined,
                }}
              >
                <div
                  className="h-5 w-5 rounded-full transition-shadow duration-200"
                  style={{
                    background: c.primary,
                    boxShadow: isActive ? `0 0 12px ${c.glow}` : "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                />
                <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {t(c.label, c.labelEn)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModeCard({ active, onClick, isDark, accentColor, glow, children }: {
  active: boolean;
  onClick: () => void;
  isDark: boolean;
  accentColor: string;
  glow: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border p-4 text-left transition-all duration-200 ${
        active
          ? "border-2"
          : isDark
            ? "border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]"
            : "border-black/[0.05] hover:border-black/[0.1] hover:bg-black/[0.02]"
      }`}
      style={{
        borderColor: active ? accentColor : undefined,
        boxShadow: active ? `0 0 24px ${glow}` : undefined,
      }}
    >
      {children}
    </button>
  );
}
