"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";

type Provider = {
  id: string;
  provider_type: string;
  display_name: string;
  api_key: string;
  base_url: string | null;
  model_id: string;
  is_active: boolean;
  priority: number;
};

const PROVIDER_TYPES = [
  { value: "gemini", zh: "Gemini (Google)", en: "Gemini (Google)" },
  { value: "openai", zh: "GPT / DALL-E (OpenAI)", en: "GPT / DALL-E (OpenAI)" },
  { value: "doubao", zh: "豆包 (字节跳动)", en: "Doubao (ByteDance)" },
  { value: "jimeng", zh: "即梦 Seedream (字节跳动)", en: "Jimeng Seedream (ByteDance)" },
  { value: "tongyi", zh: "通义万相 (阿里)", en: "Tongyi Wanxiang (Alibaba)" },
];

const BASE_URL_DEFAULTS: Record<string, string> = {
  doubao: "https://ark.cn-beijing.volces.com",
  jimeng: "https://ark.cn-beijing.volces.com",
  tongyi: "https://dashscope.aliyuncs.com",
};

const REQUIRES_BASE_URL = new Set(["doubao", "jimeng"]);

export function AiProvidersManager() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    provider_type: "gemini",
    display_name: "",
    api_key: "",
    base_url: "",
    model_id: "",
    priority: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {
      setError(t("加载失败", "Load failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
      const res = await fetch("/api/ai-providers");
      const data = await res.json();
      if (!cancelled) setProviders(data.providers ?? []);
    } catch {
        if (!cancelled) setError(t("加载失败", "Load failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [t]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      setFormData({ provider_type: "gemini", display_name: "", api_key: "", base_url: "", model_id: "", priority: 0 });
      fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("保存失败", "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/ai-providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    });
    fetchProviders();
  }

  async function deleteProvider(id: string) {
    if (!confirm(t("确定删除此模型配置？", "Delete this model configuration?"))) return;
    await fetch(`/api/ai-providers/${id}`, { method: "DELETE" });
    fetchProviders();
  }

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${isDark ? "border-white/[0.08] bg-white/[0.05] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-cyan-400/40" : "border-black/[0.06] bg-white text-slate-900 placeholder:text-slate-400 focus:ring-cyan-500/30 focus:border-cyan-500"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{t("AI 模型配置", "AI Model Config")}</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2 text-sm font-medium text-white shadow-lg ${colors.shadow} transition-all`}
        >
          {showForm ? t("取消", "Cancel") : t("添加模型", "Add Model")}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className={`space-y-3 rounded-[18px] border p-5 ${isDark ? "border-white/[0.08] bg-white/[0.03]" : "border-black/[0.05] bg-white/80"}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("模型类型", "Provider Type")}</label>
              <select value={formData.provider_type} onChange={(e) => { const pt = e.target.value; setFormData({ ...formData, provider_type: pt, base_url: BASE_URL_DEFAULTS[pt] || "" }); }} className={inputClass}>
                {PROVIDER_TYPES.map((pt) => (<option key={pt.value} value={pt.value}>{t(pt.zh, pt.en)}</option>))}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("显示名称", "Display Name")}</label>
              <input type="text" value={formData.display_name} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} placeholder="e.g. Gemini Flash" className={inputClass} required />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>API Key</label>
              <input type="password" value={formData.api_key} onChange={(e) => setFormData({ ...formData, api_key: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("模型 ID", "Model ID")}</label>
              <input type="text" value={formData.model_id} onChange={(e) => setFormData({ ...formData, model_id: e.target.value })} placeholder="e.g. gemini-2.0-flash-exp" className={inputClass} required />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{REQUIRES_BASE_URL.has(formData.provider_type) ? t("Base URL (必填)", "Base URL (required)") : t("Base URL (可选)", "Base URL (optional)")}</label>
              <input type="text" value={formData.base_url} onChange={(e) => setFormData({ ...formData, base_url: e.target.value })} placeholder={BASE_URL_DEFAULTS[formData.provider_type] || t("留空使用默认", "Leave empty for default")} className={inputClass} required={REQUIRES_BASE_URL.has(formData.provider_type)} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>{t("优先级", "Priority")}</label>
              <input type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })} className={inputClass} />
            </div>
          </div>
          <button type="submit" disabled={saving} className={`rounded-lg bg-gradient-to-r ${colors.gradient} px-5 py-2.5 text-sm font-medium text-white shadow-lg ${colors.shadow} disabled:opacity-50 transition-all`}>
            {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
          </button>
        </form>
      )}

      {loading ? (
        <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("加载中...", "Loading...")}</p>
      ) : providers.length === 0 ? (
        <div className={`rounded-[18px] border border-dashed p-8 text-center ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-black/[0.06] bg-slate-50/50"}`}>
          <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("暂无配置，请添加 AI 模型", "No models configured. Add one above.")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div key={p.id} className={`flex items-center justify-between rounded-[14px] border px-4 py-3 transition-colors ${isDark ? "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.1]" : "border-black/[0.05] bg-white/80 hover:border-black/[0.1]"}`}>
              <div className="flex items-center gap-3">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.is_active ? "bg-cyan-400 shadow-sm shadow-cyan-400/50" : "bg-slate-400"}`} />
                <div>
                  <p className={`text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>{p.display_name}</p>
                  <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {(() => {
                      const providerType = PROVIDER_TYPES.find((pt) => pt.value === p.provider_type);
                      return providerType ? t(providerType.zh, providerType.en) : p.provider_type;
                    })()} · {p.model_id} · Key: {p.api_key}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("优先级", "Priority")} {p.priority}</span>
                <button onClick={() => toggleActive(p.id, p.is_active)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${p.is_active ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"}`}>
                  {p.is_active ? t("禁用", "Disable") : t("启用", "Enable")}
                </button>
                <button onClick={() => deleteProvider(p.id)} className="rounded-md px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                  {t("删除", "Delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
