"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

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
  { value: "gemini", label: "Gemini (Google)" },
  { value: "openai", label: "GPT / DALL-E (OpenAI)" },
  { value: "doubao", label: "豆包 (字节跳动)" },
  { value: "tongyi", label: "通义万相 (阿里)" },
];

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

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

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
      setError(err instanceof Error ? err.message : "保存失败");
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
    if (!confirm("确定删除此模型配置？")) return;
    await fetch(`/api/ai-providers/${id}`, { method: "DELETE" });
    fetchProviders();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">AI 模型配置</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          {showForm ? "取消" : "添加模型"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">模型类型</label>
              <select
                value={formData.provider_type}
                onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">显示名称</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder="如: Gemini Flash"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
              <input
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">模型 ID</label>
              <input
                type="text"
                value={formData.model_id}
                onChange={(e) => setFormData({ ...formData, model_id: e.target.value })}
                placeholder="如: gemini-2.0-flash-exp"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Base URL (可选)</label>
              <input
                type="text"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                placeholder="留空使用默认"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">优先级</label>
              <input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">加载中...</p>
      ) : providers.length === 0 ? (
        <p className="text-sm text-slate-500">暂无配置，请添加 AI 模型</p>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`inline-block h-2 w-2 rounded-full ${p.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                <div>
                  <p className="text-sm font-medium text-slate-800">{p.display_name}</p>
                  <p className="text-xs text-slate-500">
                    {PROVIDER_TYPES.find((t) => t.value === p.provider_type)?.label} · {p.model_id} · Key: {p.api_key}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">优先级 {p.priority}</span>
                <button
                  onClick={() => toggleActive(p.id, p.is_active)}
                  className={`rounded px-2 py-1 text-xs ${p.is_active ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                >
                  {p.is_active ? "禁用" : "启用"}
                </button>
                <button
                  onClick={() => deleteProvider(p.id)}
                  className="rounded px-2 py-1 text-xs bg-red-100 text-red-700"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
