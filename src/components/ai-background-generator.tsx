"use client";

import { type FormEvent, useEffect, useState } from "react";
import { DropZone } from "@/components/drop-zone";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { getUploadedImageUrl, type UploadApiResult } from "@/lib/upload-result";

type ProviderOption = {
  id: string;
  display_name: string;
};

type GenerateResult = {
  result_url?: string;
  provider?: string;
  model?: string;
};

const PRINT_AVOID_TERMS = [
  "衣服",
  "模特",
  "人物",
  "身体",
  "背景",
  "墙面",
  "地面",
  "布料纹理",
  "褶皱",
  "阴影",
  "口袋",
  "帽绳",
  "袖子",
  "衣领",
  "裤子",
  "手",
  "低清晰度",
  "模糊",
  "噪点",
  "图案残缺",
  "文字错误",
  "乱码文字",
  "变形文字",
  "多余文字",
  "水印",
  "logo",
  "边框",
  "裁切",
  "重复图案",
  "拍摄光影",
  "商品照片背景",
  "衣架",
  "标签",
  "拉链",
  "纽扣",
  "头发",
  "皮肤",
].join("，");

const PRINT_PROMPT_TEMPLATES = [
  {
    name: "精准提取印花",
    prompt: `请参考上传的服装图片，仅提取衣服上的印花图案，并重新整理为干净、完整、高清的独立印花素材。保留原图中的主要图案元素、文字内容、颜色搭配、整体构图和风格，不要改变主题。输出为居中排版、白色或透明背景、边缘清晰、细节完整、适合POD服装印刷的图案素材。不要包含：${PRINT_AVOID_TERMS}。`,
  },
  {
    name: "高清还原印花",
    prompt: `请从上传的服装照片中识别并还原衣服表面的印花设计，只保留印花本身。按原印花的图案、文字、色彩、层次和构图重新绘制为高清印刷素材，线条干净，边缘锐利，色块清晰，文字尽量保持正确。不要生成服装、人物、背景或摄影痕迹。不要包含：${PRINT_AVOID_TERMS}。`,
  },
  {
    name: "矢量风印花",
    prompt: `请参考上传图片里的服装印花，生成适合服装印刷的独立矢量风图案素材。保持原始印花主题、主视觉、文字位置、颜色关系和整体风格，增强线条清晰度与图案完整度，输出居中、干净、无多余背景的POD印花图。不要包含：${PRINT_AVOID_TERMS}。`,
  },
  {
    name: "文字图案修复",
    prompt: `请提取上传服装图片中的印花图案，并重点修复印花内的文字、边缘和图案缺失部分。尽量保留原印花文字内容和排版，不新增无关文字，不改变主题风格。输出干净完整、高清、居中、可直接用于服装印刷的独立图案素材。不要包含：${PRINT_AVOID_TERMS}。`,
  },
  {
    name: "黑白线稿印花",
    prompt: `请参考上传的服装图片，仅提取衣服上的印花主体，并整理为黑白高对比线稿风格的独立印花素材。保留原图案主题、构图和文字位置，强化轮廓、线条和边缘清晰度，输出居中、干净、适合POD服装印刷的图案。不要包含：${PRINT_AVOID_TERMS}。`,
  },
];

export function AiBackgroundGenerator() {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [prompt, setPrompt] = useState(PRINT_PROMPT_TEMPLATES[0].prompt);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mode, accent } = useSettings();
  const colors = ACCENT_COLORS[accent];
  const isDark = mode === "dark";

  const inputClass = `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-1 transition-colors ${isDark ? "border-white/10 bg-slate-800/50 text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-blue-500"}`;

  function handleFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/ai-providers");
        const data = await res.json();
        if (cancelled) return;
        const active = (data.providers ?? []).filter((p: { is_active: boolean }) => p.is_active);
        setProviders(active);
        setSelectedProvider((c) => c || active[0]?.id || "");
      } catch {
        /* ignore */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!file || !prompt.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("files", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadData.results?.[0]?.success) throw new Error("图片上传失败");
      const imageUrl = getUploadedImageUrl(uploadData.results[0] as UploadApiResult);
      if (!imageUrl) throw new Error("图片上传成功，但缺少可访问的图片 URL");

      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          reference_url: imageUrl,
          provider_id: selectedProvider || undefined,
          save_to_assets: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>选择模型</label>
          {providers.length === 0 ? (
            <p className="text-sm text-amber-500">请先在“设置”页面添加 AI 模型</p>
          ) : (
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className={inputClass}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>上传原图</label>
          <DropZone file={file} preview={preview} onFileChange={handleFile} label="拖拽图片到此处，或点击选择" hint="支持 jpg、png、webp" />
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>常用模板</label>
          <select
            value={templateIndex}
            onChange={(e) => {
              const nextIndex = Number(e.target.value);
              setTemplateIndex(nextIndex);
              setPrompt(PRINT_PROMPT_TEMPLATES[nextIndex]?.prompt ?? "");
            }}
            className={inputClass}
          >
            {PRINT_PROMPT_TEMPLATES.map((template, index) => (
              <option key={template.name} value={index}>{template.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>提示词 (Prompt)</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} placeholder="请填写印花提取提示词..." className={inputClass} required />
        </div>

        <button type="submit" disabled={generating || !file || providers.length === 0} className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-3 text-sm font-semibold text-white shadow-lg ${colors.shadow} hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all`}>
          {generating ? "生成中..." : "图生图"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>

      <div className={`flex items-center justify-center rounded-xl border p-4 min-h-[400px] ${isDark ? "border-white/5 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
        {generating ? (
          <div className="text-center">
            <div className={`mx-auto h-10 w-10 animate-spin rounded-full border-2 border-t-transparent ${isDark ? "border-blue-400" : "border-blue-500"}`} />
            <p className={`mt-4 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>AI 正在生成图片...</p>
          </div>
        ) : result?.result_url ? (
          <div className="space-y-3 text-center">
            <img src={result.result_url} alt="AI generated" className="max-h-[360px] rounded-lg shadow-lg" />
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>{result.provider} / {result.model} · 已保存到素材库</p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center ${isDark ? "bg-slate-700/50" : "bg-slate-200/80"}`}>
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            </div>
            <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>生成结果将显示在这里</p>
          </div>
        )}
      </div>
    </div>
  );
}
