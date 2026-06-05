"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  cooldown_until?: string | null;
  daily_limit?: number | null;
  daily_used?: number | null;
  failure_count?: number | null;
  health_status?: string | null;
  last_error_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_success_at?: string | null;
  last_used_at?: string | null;
  request_count?: number | null;
  success_count?: number | null;
};

type ProviderFormData = {
  provider_type: string;
  display_name: string;
  api_key: string;
  base_url: string;
  model_id: string;
  priority: number;
  daily_limit: string;
};

type ProvidersApiResponse = {
  providers?: Provider[];
};

const PROVIDER_TYPES = [
  { value: "gemini", zh: "Gemini (Google)", en: "Gemini (Google)", badge: "GEM" },
  { value: "openai", zh: "GPT / DALL-E (OpenAI)", en: "GPT / DALL-E (OpenAI)", badge: "OAI" },
  { value: "doubao", zh: "豆包 Seedream (火山方舟)", en: "Doubao Seedream (Volcano Ark)", badge: "ARK" },
  { value: "jimeng", zh: "即梦 Seedream (火山方舟)", en: "Jimeng Seedream (Volcano Ark)", badge: "JM" },
  { value: "tongyi", zh: "通义万相 / 百炼 (阿里)", en: "Tongyi Wanxiang / Bailian (Alibaba)", badge: "QW" },
];

const BASE_URL_DEFAULTS: Record<string, string> = {
  doubao: "https://ark.cn-beijing.volces.com",
  jimeng: "https://ark.cn-beijing.volces.com",
  tongyi: "https://dashscope.aliyuncs.com",
};

const REQUIRES_BASE_URL = new Set(["doubao", "jimeng"]);

const EMPTY_FORM: ProviderFormData = {
  provider_type: "tongyi",
  display_name: "",
  api_key: "",
  base_url: BASE_URL_DEFAULTS.tongyi,
  model_id: "qwen-image-edit-plus-2025-10-30",
  priority: 0,
  daily_limit: "",
};

async function readJsonResponse(res: Response) {
  const text = await res.text();
  let data: Record<string, unknown> = {};

  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : res.statusText);
  }

  return data;
}

function getProviderMeta(type: string) {
  return PROVIDER_TYPES.find((item) => item.value === type) ?? {
    value: type,
    zh: type,
    en: type,
    badge: type.slice(0, 3).toUpperCase(),
  };
}

function sortProviders(providers: Provider[]) {
  return [...providers].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return b.priority - a.priority;
  });
}

function providerGroupKey(provider: Pick<Provider, "base_url" | "model_id" | "provider_type">) {
  return `${provider.provider_type}::${provider.model_id}::${provider.base_url || ""}`;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getHealthMeta(status?: string | null) {
  switch (status) {
    case "cooldown":
      return { color: "text-sky-400", labelEn: "Cooling", labelZh: "冷却中", tone: "bg-sky-500/10" };
    case "rate_limited":
      return { color: "text-amber-400", labelEn: "Rate Limited", labelZh: "限流中", tone: "bg-amber-500/10" };
    case "quota_exhausted":
      return { color: "text-red-400", labelEn: "Quota Empty", labelZh: "额度耗尽", tone: "bg-red-500/10" };
    case "invalid_key":
      return { color: "text-red-400", labelEn: "Invalid Key", labelZh: "Key 无效", tone: "bg-red-500/10" };
    case "error":
      return { color: "text-orange-400", labelEn: "Error", labelZh: "异常", tone: "bg-orange-500/10" };
    default:
      return { color: "text-emerald-400", labelEn: "Healthy", labelZh: "健康", tone: "bg-emerald-500/10" };
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function AiProvidersManager() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ProviderFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<ProviderFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isDark, accent, t } = useSettings();
  const colors = ACCENT_COLORS[accent];

  const orderedProviders = useMemo(() => sortProviders(providers), [providers]);
  const activeProviders = useMemo(() => providers.filter((provider) => provider.is_active), [providers]);
  const currentProvider = useMemo(() => sortProviders(activeProviders)[0] ?? null, [activeProviders]);
  const modelKeyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    providers.forEach((provider) => {
      const key = providerGroupKey(provider);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [providers]);
  const nextDefaultPriority = useMemo(() => {
    const maxPriority = providers.reduce((max, provider) => Math.max(max, provider.priority), 0);
    return maxPriority + 1;
  }, [providers]);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-providers");
      const data = await readJsonResponse(res) as ProvidersApiResponse;
      setProviders(data.providers ?? []);
      window.dispatchEvent(new Event("pod-ai-providers-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("加载模型配置失败", "Failed to load model configs"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/ai-providers")
      .then((res) => readJsonResponse(res) as Promise<ProvidersApiResponse>)
      .then((data) => {
        if (cancelled) return;
        setProviders(data.providers ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("加载模型配置失败", "Failed to load model configs"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  function updateFormProviderType(providerType: string) {
    setFormData((current) => ({
      ...current,
      provider_type: providerType,
      base_url: BASE_URL_DEFAULTS[providerType] || "",
      model_id: providerType === "tongyi" ? "qwen-image-edit-plus-2025-10-30" : current.model_id,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        daily_limit: formData.daily_limit.trim() ? Number(formData.daily_limit) : null,
      };
      const res = await fetch("/api/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readJsonResponse(res);
      setShowForm(false);
      setFormData(EMPTY_FORM);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("保存模型失败", "Failed to save model"));
    } finally {
      setSaving(false);
    }
  }

  function startEditing(provider: Provider) {
    setEditingId(provider.id);
    setEditData({
      provider_type: provider.provider_type,
      display_name: provider.display_name,
      api_key: "",
      base_url: provider.base_url ?? "",
      model_id: provider.model_id,
      priority: provider.priority,
      daily_limit: provider.daily_limit == null ? "" : String(provider.daily_limit),
    });
  }

  function startAddingBackupKey(provider: Provider) {
    setShowForm(true);
    setFormData({
      provider_type: provider.provider_type,
      display_name: provider.display_name,
      api_key: "",
      base_url: provider.base_url ?? "",
      model_id: provider.model_id,
      priority: provider.priority,
      daily_limit: provider.daily_limit == null ? "" : String(provider.daily_limit),
    });
  }

  async function saveEditing(id: string) {
    if (!editData) return;
    setBusyId(id);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        display_name: editData.display_name,
        model_id: editData.model_id,
        base_url: editData.base_url,
        priority: editData.priority,
        daily_limit: editData.daily_limit.trim() ? Number(editData.daily_limit) : null,
      };
      if (editData.api_key.trim()) {
        body.api_key = editData.api_key.trim();
      }

      const res = await fetch(`/api/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await readJsonResponse(res);
      setEditingId(null);
      setEditData(null);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("更新模型失败", "Failed to update model"));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      await readJsonResponse(res);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("切换模型状态失败", "Failed to switch model status"));
    } finally {
      setBusyId(null);
    }
  }

  async function setDefaultProvider(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: true, priority: nextDefaultPriority }),
      });
      await readJsonResponse(res);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("切换默认模型失败", "Failed to switch default model"));
    } finally {
      setBusyId(null);
    }
  }

  async function resetProviderHealth(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_health: true }),
      });
      await readJsonResponse(res);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("恢复模型健康状态失败", "Failed to reset model health"));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm(t("确定删除这个模型配置？", "Delete this model configuration?"))) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ai-providers/${id}`, { method: "DELETE" });
      await readJsonResponse(res);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("删除模型失败", "Failed to delete model"));
    } finally {
      setBusyId(null);
    }
  }

  const surfaceClass = isDark
    ? "border-white/[0.08] bg-white/[0.04] text-slate-100"
    : "border-black/[0.05] bg-white/85 text-slate-900";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${
    isDark
      ? "border-white/[0.08] bg-white/[0.05] text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40"
      : "border-black/[0.06] bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
  }`;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: colors.primary, color: colors.primary }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.primary }} />
            {t("AI 模型中枢", "AI Model Hub")}
          </p>
          <h3 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-950"}`}>
            {t("AI 模型配置", "AI Model Configuration")}
          </h3>
          <p className={`mt-1 text-sm ${mutedText}`}>
            {t("统一管理 API Key、Endpoint、模型 ID、健康状态、每日上限和轮询优先级。", "Manage API keys, endpoints, model IDs, health, daily limits, and routing priority.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className={`rounded-xl bg-gradient-to-r ${colors.gradient} px-5 py-3 text-sm font-bold text-white shadow-lg ${colors.shadow} transition-all hover:brightness-110`}
        >
          {showForm ? t("收起添加面板", "Collapse Form") : t("添加模型", "Add Model")}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <StatusCard
          label={t("当前默认模型", "Current Default Model")}
          value={currentProvider?.display_name ?? t("暂无启用模型", "No active model")}
          detail={currentProvider ? `${currentProvider.model_id} · P${currentProvider.priority}` : t("请添加并启用模型", "Add and enable a model")}
          isDark={isDark}
          accentColor={colors.primary}
        />
        <StatusCard
          label={t("启用模型", "Active Models")}
          value={`${activeProviders.length}`}
          detail={t(`共 ${providers.length} 个配置`, `${providers.length} total configs`)}
          isDark={isDark}
          accentColor={colors.primary}
        />
        <StatusCard
          label={t("当前 Endpoint", "Current Endpoint")}
          value={currentProvider?.base_url || t("默认接口", "Default endpoint")}
          detail={currentProvider ? getProviderMeta(currentProvider.provider_type)[t("zh", "en") === "zh" ? "zh" : "en"] : t("等待配置", "Waiting for config")}
          isDark={isDark}
          accentColor={colors.primary}
        />
      </div>

      <DefaultModelPanel
        provider={currentProvider}
        providerName={currentProvider ? t(getProviderMeta(currentProvider.provider_type).zh, getProviderMeta(currentProvider.provider_type).en) : t("未配置", "Not configured")}
        isDark={isDark}
        accentColor={colors.primary}
        glow={colors.glow}
        t={t}
      />

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className={`rounded-[22px] border p-5 shadow-sm backdrop-blur-xl ${surfaceClass}`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
                {t("新增 API 模型", "Add API Model")}
              </h4>
              <p className={`mt-1 text-xs ${mutedText}`}>
                {t("Key 会保存在后端数据库，前端列表只显示脱敏结果。", "Keys are stored server-side; the list only shows masked keys.")}
              </p>
            </div>
          </div>
          <ProviderFields
            data={formData}
            inputClass={inputClass}
            isDark={isDark}
            t={t}
            onChange={(next) => setFormData((current) => ({ ...current, ...next }))}
            onProviderTypeChange={updateFormProviderType}
            requireApiKey
          />
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className={`rounded-xl bg-gradient-to-r ${colors.gradient} px-5 py-2.5 text-sm font-bold text-white shadow-lg ${colors.shadow} transition-all disabled:opacity-50`}
            >
              {saving ? t("保存中...", "Saving...") : t("保存模型", "Save Model")}
            </button>
          </div>
        </form>
      )}

      <div className={`rounded-[22px] border p-4 shadow-sm backdrop-blur-xl ${surfaceClass}`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-950"}`}>
              {t("模型清单", "Model Inventory")}
            </h4>
            <p className={`mt-1 text-xs ${mutedText}`}>
              {t("系统会按健康状态、优先级和最近使用时间自动轮询；必要时可手动设为默认或恢复健康。", "The system routes by health, priority, and last-used time; you can still set default or reset health manually.")}
            </p>
          </div>
          {currentProvider && (
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: `${colors.primary}1a`, color: colors.primary }}>
              {t("当前默认模型：", "Default: ")}{currentProvider.display_name}
            </span>
          )}
        </div>

        {loading ? (
          <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${isDark ? "border-white/[0.08] text-slate-500" : "border-black/[0.06] text-slate-400"}`}>
            {t("加载中...", "Loading...")}
          </div>
        ) : orderedProviders.length === 0 ? (
          <div className={`rounded-2xl border border-dashed p-8 text-center ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-black/[0.06] bg-slate-50/60"}`}>
            <p className={`text-sm font-medium ${mutedText}`}>{t("暂无模型配置，请先添加一个 AI 模型。", "No model configs yet. Add an AI model first.")}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {orderedProviders.map((provider) => {
              const meta = getProviderMeta(provider.provider_type);
              const isCurrent = currentProvider?.id === provider.id;
              const isEditing = editingId === provider.id && editData;
              const health = getHealthMeta(provider.health_status);
              const dailyUsed = numberOrZero(provider.daily_used);
              const dailyLimit = typeof provider.daily_limit === "number" ? provider.daily_limit : null;
              const successCount = numberOrZero(provider.success_count);
              const requestCount = numberOrZero(provider.request_count);
              const successRate = requestCount > 0 ? `${Math.round((successCount / requestCount) * 100)}%` : "-";
              const keyCount = modelKeyCounts.get(providerGroupKey(provider)) ?? 1;

              return (
                <article
                  key={provider.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isCurrent
                      ? "shadow-[0_0_34px_rgba(6,182,212,0.16)]"
                      : ""
                  } ${isDark ? "border-white/[0.07] bg-black/[0.12]" : "border-black/[0.05] bg-white"}`}
                  style={{
                    borderColor: isCurrent ? colors.primary : undefined,
                  }}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg px-2.5 py-1 text-[11px] font-black" style={{ background: `${colors.primary}1f`, color: colors.primary }}>
                          {meta.badge}
                        </span>
                        <h5 className={`truncate text-base font-black ${isDark ? "text-white" : "text-slate-950"}`}>
                          {provider.display_name}
                        </h5>
                        {provider.is_active ? (
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">
                            {t("启用中", "Active")}
                          </span>
                        ) : (
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isDark ? "bg-slate-700/50 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                            {t("已停用", "Disabled")}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${colors.primary}1f`, color: colors.primary }}>
                            {t("默认使用", "Default")}
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${health.tone} ${health.color}`}>
                          {t(health.labelZh, health.labelEn)}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-4">
                          <ProviderFields
                            data={editData}
                            inputClass={inputClass}
                            isDark={isDark}
                            t={t}
                            onChange={(next) => setEditData((current) => current ? ({ ...current, ...next }) : current)}
                            disableProviderType
                          />
                        </div>
                      ) : (
                        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2 2xl:grid-cols-4">
                          <InfoPill label={t("Provider", "Provider")} value={t(meta.zh, meta.en)} isDark={isDark} />
                          <InfoPill label={t("Model ID", "Model ID")} value={provider.model_id} isDark={isDark} />
                          <InfoPill label={t("Endpoint", "Endpoint")} value={provider.base_url || t("使用默认接口", "Use default endpoint")} isDark={isDark} />
                          <InfoPill label={t("Key / 优先级", "Key / Priority")} value={`${provider.api_key} · P${provider.priority}`} isDark={isDark} />
                          <InfoPill label={t("同模型 Key", "Model Keys")} value={`${keyCount}`} isDark={isDark} />
                          <InfoPill label={t("本地额度", "Local Quota")} value={dailyLimit == null ? `${dailyUsed} / ∞` : `${dailyUsed} / ${dailyLimit}`} isDark={isDark} />
                          <InfoPill label={t("成功率", "Success Rate")} value={`${successRate} · ${successCount}/${requestCount}`} isDark={isDark} />
                          <InfoPill label={t("最近成功", "Last Success")} value={formatDateTime(provider.last_success_at)} isDark={isDark} />
                          <InfoPill label={t("冷却到", "Cooldown Until")} value={formatDateTime(provider.cooldown_until)} isDark={isDark} />
                        </div>
                      )}
                      {!isEditing && provider.last_error_message && (
                        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${isDark ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700"}`}>
                          <span className="font-bold">{t("最近错误", "Last Error")}:</span>{" "}
                          <span title={provider.last_error_message}>{provider.last_error_code ? `${provider.last_error_code} · ` : ""}{provider.last_error_message}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === provider.id}
                            onClick={() => saveEditing(provider.id)}
                            className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {t("保存", "Save")}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingId(null); setEditData(null); }}
                            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${isDark ? "bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            {t("取消", "Cancel")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busyId === provider.id || isCurrent}
                            onClick={() => setDefaultProvider(provider.id)}
                            className={
                              isCurrent
                                ? "rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-400 opacity-80"
                                : `rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-50 bg-gradient-to-r ${colors.gradient} ${colors.shadow} hover:brightness-110`
                            }
                          >
                            {isCurrent ? t("当前默认", "Default") : provider.is_active ? t("设为默认", "Set Default") : t("启用并设默认", "Enable Default")}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditing(provider)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${isDark ? "bg-white/[0.06] text-slate-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            {t("编辑", "Edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => startAddingBackupKey(provider)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${isDark ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
                          >
                            {t("添加备用 Key", "Add Backup Key")}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === provider.id}
                            onClick={() => toggleActive(provider.id, provider.is_active)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                              provider.is_active
                                ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/15"
                                : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                            }`}
                          >
                            {provider.is_active ? t("禁用", "Disable") : t("启用", "Enable")}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === provider.id}
                            onClick={() => resetProviderHealth(provider.id)}
                            className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${isDark ? "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"}`}
                          >
                            {t("恢复健康", "Reset Health")}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === provider.id}
                            onClick={() => deleteProvider(provider.id)}
                            className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
                          >
                            {t("删除", "Delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ProviderFields({
  data,
  inputClass,
  isDark,
  t,
  onChange,
  onProviderTypeChange,
  disableProviderType = false,
  requireApiKey = false,
}: {
  data: ProviderFormData;
  inputClass: string;
  isDark: boolean;
  t: (zh: string, en: string) => string;
  onChange: (value: Partial<ProviderFormData>) => void;
  onProviderTypeChange?: (providerType: string) => void;
  disableProviderType?: boolean;
  requireApiKey?: boolean;
}) {
  const labelClass = `mb-1.5 block text-xs font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`;
  const helpClass = `mt-1 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`;
  const baseUrlRequired = REQUIRES_BASE_URL.has(data.provider_type);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div>
        <label className={labelClass}>{t("模型类型", "Provider Type")}</label>
        <select
          value={data.provider_type}
          disabled={disableProviderType}
          onChange={(e) => onProviderTypeChange?.(e.target.value)}
          className={inputClass}
        >
          {PROVIDER_TYPES.map((item) => (
            <option key={item.value} value={item.value}>{t(item.zh, item.en)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>{t("显示名称", "Display Name")}</label>
        <input
          type="text"
          value={data.display_name}
          onChange={(e) => onChange({ display_name: e.target.value })}
          placeholder={t("例如：百炼印花提取", "e.g. Bailian Print Extract")}
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass}>API Key</label>
        {requireApiKey ? (
          <>
            <textarea
              value={data.api_key}
              onChange={(e) => onChange({ api_key: e.target.value })}
              placeholder={t("可粘贴多个 Key，每行一个", "Paste multiple keys, one per line")}
              className={`${inputClass} min-h-24 resize-y`}
              required
            />
            <p className={helpClass}>
              {t("多个 Key 会保存到同一个模型配置下，系统按健康状态和最近使用时间自动轮询。", "Multiple keys are saved under the same model and rotated by health and last-used time.")}
            </p>
          </>
        ) : (
          <input
            type="password"
            value={data.api_key}
            onChange={(e) => onChange({ api_key: e.target.value })}
            placeholder={t("留空则保留原 Key", "Leave blank to keep existing key")}
            className={inputClass}
          />
        )}
      </div>
      <div>
        <label className={labelClass}>{t("模型 ID", "Model ID")}</label>
        <input
          type="text"
          value={data.model_id}
          onChange={(e) => onChange({ model_id: e.target.value })}
          placeholder="qwen-image-edit-plus-2025-10-30"
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass}>
          {baseUrlRequired ? t("Base URL (必填)", "Base URL (required)") : t("Base URL (可选)", "Base URL (optional)")}
        </label>
        <input
          type="text"
          value={data.base_url}
          onChange={(e) => onChange({ base_url: e.target.value })}
          placeholder={BASE_URL_DEFAULTS[data.provider_type] || t("留空使用默认接口", "Leave blank to use default")}
          className={inputClass}
          required={baseUrlRequired}
        />
        {data.provider_type === "tongyi" && (
          <p className={helpClass}>{t("国内 Key 用 dashscope.aliyuncs.com，国际站 Key 用 dashscope-intl.aliyuncs.com。", "CN keys use dashscope.aliyuncs.com; intl keys use dashscope-intl.aliyuncs.com.")}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>{t("优先级", "Priority")}</label>
        <input
          type="number"
          value={data.priority}
          onChange={(e) => onChange({ priority: Number(e.target.value) })}
          className={inputClass}
        />
        <div className="mt-3">
          <label className={labelClass}>{t("每日本地上限", "Daily Local Limit")}</label>
          <input
            type="number"
            min={0}
            value={data.daily_limit}
            onChange={(e) => onChange({ daily_limit: e.target.value })}
            placeholder={t("留空不限", "No local limit")}
            className={inputClass}
          />
          <p className={helpClass}>{t("用于本系统轮询保护，不等同于官方实时余额。", "Used for routing protection; not official real-time balance.")}</p>
        </div>
        <p className={helpClass}>{t("启用模型中优先级最高者会作为默认模型；同优先级会按最近使用时间轮询。", "Highest active priority becomes the default; equal priority rotates by last-used time.")}</p>
      </div>
    </div>
  );
}

function DefaultModelPanel({
  provider,
  providerName,
  isDark,
  accentColor,
  glow,
  t,
}: {
  provider: Provider | null;
  providerName: string;
  isDark: boolean;
  accentColor: string;
  glow: string;
  t: (zh: string, en: string) => string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border p-5 ${
        isDark ? "border-white/[0.08] bg-black/[0.16]" : "border-black/[0.05] bg-white/90"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-40"
        style={{ background: `radial-gradient(circle at 70% 20%, ${glow}, transparent 42%)` }}
      />
      <div className="relative z-10 grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: `${accentColor}1f`, color: accentColor }}>
              {t("默认模型控制台", "Default Model Console")}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${isDark ? "bg-white/[0.06] text-slate-400" : "bg-slate-100 text-slate-500"}`}>
              {t("点击模型卡片右侧“设为默认”切换", "Use Set Default on a model card to switch")}
            </span>
          </div>
          <h4 className={`truncate text-2xl font-black ${isDark ? "text-white" : "text-slate-950"}`}>
            {provider?.display_name ?? t("暂无启用默认模型", "No active default model")}
          </h4>
          <p className={`mt-1 truncate text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {provider ? `${provider.model_id} · P${provider.priority}` : t("添加模型后点击“设为默认”即可启用。", "Add a model, then click Set Default to enable it.")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
          <MiniMetric label={t("Provider", "Provider")} value={provider ? providerName : "-"} isDark={isDark} />
          <MiniMetric label={t("Endpoint", "Endpoint")} value={provider?.base_url || t("默认接口", "Default endpoint")} isDark={isDark} />
          <MiniMetric label={t("调度方式", "Routing")} value={t("健康优先轮询", "Health-aware rotation")} isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${isDark ? "border-white/[0.07] bg-white/[0.035]" : "border-black/[0.05] bg-slate-50/80"}`}>
      <p className={`text-[10px] font-black uppercase tracking-wide ${isDark ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 truncate text-xs font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`} title={value}>{value}</p>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  isDark,
  accentColor,
}: {
  label: string;
  value: string;
  detail: string;
  isDark: boolean;
  accentColor: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.08] bg-white/[0.035]" : "border-black/[0.05] bg-white/75"}`}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: accentColor, boxShadow: `0 0 14px ${accentColor}` }} />
        <p className={`text-xs font-bold uppercase tracking-wide ${isDark ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      </div>
      <p className={`mt-2 truncate text-lg font-black ${isDark ? "text-white" : "text-slate-950"}`} title={value}>{value}</p>
      <p className={`mt-1 truncate text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`} title={detail}>{detail}</p>
    </div>
  );
}

function InfoPill({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-black/[0.04] bg-slate-50/80"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${isDark ? "text-slate-500" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 truncate font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`} title={value}>{value}</p>
    </div>
  );
}
