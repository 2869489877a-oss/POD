"use client";

import { useSettings, ACCENT_COLORS, type AccentColor } from "@/lib/settings/context";

const ACCENT_OPTIONS: AccentColor[] = ["violet", "blue", "emerald", "rose", "amber", "cyan"];

export function SettingsPanel() {
  const { mode, language, accent, setMode, setLanguage, setAccent, t } = useSettings();
  const isDark = mode !== "light";
  const isPremium = mode === "premium";

  const cardClass = isPremium
    ? "rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl"
    : `rounded-xl border p-5 ${isDark ? "border-white/5 bg-[#12122a]" : "border-slate-200 bg-white"}`;
  const labelClass = `text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`;
  const descClass = `text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`;

  return (
    <div className="space-y-6">
      {/* Theme Mode */}
      <div className={cardClass}>
        <h4 className={`text-base font-semibold mb-4 ${isDark ? "text-white" : "text-slate-900"}`}>
          {t("外观模式", "Appearance")}
        </h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ThemeModeCard
            active={mode === "premium"}
            onClick={() => setMode("premium")}
            isDark={isDark}
            accent={accent}
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846A4.5 4.5 0 0 0 5.096 12.81L2.25 12l2.846-.81a4.5 4.5 0 0 0 3.09-3.093L9 5.25l.813 2.847a4.5 4.5 0 0 0 3.09 3.093l2.847.81-2.847.81a4.5 4.5 0 0 0-3.09 3.094ZM18 3.75l.46 1.61a2.25 2.25 0 0 0 1.54 1.54l1.61.46-1.61.46a2.25 2.25 0 0 0-1.54 1.54L18 11.25l-.46-1.61a2.25 2.25 0 0 0-1.54-1.54l-1.61-.46 1.61-.46a2.25 2.25 0 0 0 1.54-1.54L18 3.75Z" />
              </svg>
              <span className={labelClass}>{t("高级默认", "Premium Default")}</span>
            </div>
            <p className={descClass}>{t("高级酷炫工作台，默认推荐", "Premium workstation, recommended default")}</p>
          </ThemeModeCard>

          <ThemeModeCard
            active={mode === "dark"}
            onClick={() => setMode("dark")}
            isDark={isDark}
            accent={accent}
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
              </svg>
              <span className={labelClass}>{t("深色模式", "Dark Mode")}</span>
            </div>
            <p className={descClass}>{t("深色背景，护眼舒适", "Dark background, easy on eyes")}</p>
          </ThemeModeCard>

          <ThemeModeCard
            active={mode === "light"}
            onClick={() => setMode("light")}
            isDark={isDark}
            accent={accent}
          >
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
              <span className={labelClass}>{t("浅色模式", "Light Mode")}</span>
            </div>
            <p className={descClass}>{t("明亮清爽，适合白天", "Bright and clean, for daytime")}</p>
          </ThemeModeCard>
        </div>
      </div>

      {/* Language */}
      <div className={cardClass}>
        <h4 className={`text-base font-semibold mb-4 ${isDark ? "text-white" : "text-slate-900"}`}>
          {t("语言", "Language")}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <ThemeModeCard active={language === "zh"} onClick={() => setLanguage("zh")} isDark={isDark} accent={accent}>
            <span className={labelClass}>中文</span>
            <p className={descClass}>{t("简体中文界面", "Simplified Chinese interface")}</p>
          </ThemeModeCard>
          <ThemeModeCard active={language === "en"} onClick={() => setLanguage("en")} isDark={isDark} accent={accent}>
            <span className={labelClass}>English</span>
            <p className={descClass}>{t("英文界面", "English interface")}</p>
          </ThemeModeCard>
        </div>
      </div>

      {/* Accent Color */}
      <div className={cardClass}>
        <h4 className={`text-base font-semibold mb-4 ${isDark ? "text-white" : "text-slate-900"}`}>
          {t("主题颜色", "Accent Color")}
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {ACCENT_OPTIONS.map((color) => {
            const c = ACCENT_COLORS[color];
            const isActive = accent === color;
            return (
              <button
                key={color}
                onClick={() => setAccent(color)}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  isActive
                    ? `${isDark ? "bg-white/5" : "bg-slate-50"} border-2`
                    : `${isDark ? "border-white/5 hover:border-white/10" : "border-slate-200 hover:border-slate-300"}`
                }`}
                style={{ borderColor: isActive ? c.primary : undefined }}
              >
                <div className="h-6 w-6 rounded-full shadow-sm" style={{ background: c.primary }} />
                <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  {t(c.label, color.charAt(0).toUpperCase() + color.slice(1))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ThemeModeCard({ active, onClick, isDark, accent, children }: {
  active: boolean;
  onClick: () => void;
  isDark: boolean;
  accent: AccentColor;
  children: React.ReactNode;
}) {
  const colors = ACCENT_COLORS[accent];
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-all ${
        active
          ? `${isDark ? "bg-white/5" : "bg-slate-50"} border-2`
          : `${isDark ? "border-white/5 hover:border-white/10 hover:bg-white/[0.02]" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`
      }`}
      style={{ borderColor: active ? colors.primary : undefined }}
    >
      {children}
    </button>
  );
}
