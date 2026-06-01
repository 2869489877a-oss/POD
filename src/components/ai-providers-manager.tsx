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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (!cancelled) setProviders(data.providers ?? []);
      } catch {
        if (!cancelled) setError("加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

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

  const inputClass = "w-full rounded-lg border border-violet-500/20 bg-[#1a1a3e] px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">AI 模型配置</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all"
        >
          {showForm ? "取消" : "添加模型"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-violet-500/20 bg-[#12122a] p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">模型类型</label>
              <select value={formData.provider_type} onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })} className={inputClass}>
                {PROVIDER_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">显示名称</label>
              <input type="text" value={formData.display_name} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} placeholder="如: Gemini Flash" className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
              <input type="password" value={formData.api_key} onChange={(e) => setFormData({ ...formData, api_key: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">模型 ID</label>
              <input type="text" value={formData.model_id} onChange={(e) => setFormData({ ...formData, model_id: e.target.value })} placeholder="如: gemini-2.0-flash-exp" className={inputClass} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Base URL (可选)</label>
              <input type="text" value={formData.base_url} onChange={(e) => setFormData({ ...formData, base_url: e.target.value })} placeholder="留空使用默认" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">优先级</label>
              <input type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })} className={inputClass} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/20 disabled:opacity-50 transition-all">
            {saving ? "保存中..." : "保存"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">加载中...</p>
      ) : providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-violet-500/20 bg-[#12122a]/50 p-8 text-center">
          <p className="text-sm text-slate-500">暂无配置，请添加 AI 模型</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-violet-500/10 bg-[#12122a] px-4 py-3 hover:border-violet-500/30 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${p.is_active ? "bg-cyan-400 shadow-sm shadow-cyan-400/50" : "bg-slate-600"}`} />
                <div>
                  <p className="text-sm font-medium text-slate-200">{p.display_name}</p>
                  <p className="text-xs text-slate-500">
                    {PROVIDER_TYPES.find((t) => t.value === p.provider_type)?.label} · {p.model_id} · Key: {p.api_key}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">优先级 {p.priority}</span>
                <button onClick={() => toggleActive(p.id, p.is_active)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${p.is_active ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"}`}>
                  {p.is_active ? "禁用" : "启用"}
                </button>
                <button onClick={() => deleteProvider(p.id)} className="rounded-md px-2.5 py-1 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
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
