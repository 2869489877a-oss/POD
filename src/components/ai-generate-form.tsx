"use client";

import { type FormEvent, useState } from "react";

import type { AiProvider, ListingGenerationResult } from "@/lib/ai/listing-schema";

export type ProductDraftOption = {
  created_at: string;
  id: string;
  product_type: string | null;
  sku: string | null;
  status: string;
  title: string | null;
};

type AiGenerateFormProps = {
  defaultProvider: AiProvider;
  productDrafts: ProductDraftOption[];
};

type GenerateResponse = {
  error?: string;
  generation_id?: string;
  result?: ListingGenerationResult;
};

function resultToJson(result: ListingGenerationResult) {
  return JSON.stringify(result, null, 2);
}

export function AiGenerateForm({ defaultProvider, productDrafts }: AiGenerateFormProps) {
  const [provider, setProvider] = useState<AiProvider>(defaultProvider);
  const [productDraftId, setProductDraftId] = useState("");
  const [productType, setProductType] = useState("");
  const [theme, setTheme] = useState("");
  const [style, setStyle] = useState("");
  const [targetPlatform, setTargetPlatform] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [result, setResult] = useState<ListingGenerationResult | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  function handleDraftChange(nextDraftId: string) {
    setProductDraftId(nextDraftId);

    const draft = productDrafts.find((item) => item.id === nextDraftId);

    if (draft?.product_type && !productType) {
      setProductType(draft.product_type);
    }
  }

  async function submitGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setGenerationId(null);

    try {
      const response = await fetch("/api/ai/generate-listing", {
        body: JSON.stringify({
          image_description: imageDescription,
          product_draft_id: productDraftId || null,
          product_type: productType,
          provider,
          style,
          target_platform: targetPlatform,
          theme,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as GenerateResponse;

      if (!response.ok || !data.result) {
        throw new Error(data.error ?? "AI 生成失败");
      }

      setResult(data.result);
      setGenerationId(data.generation_id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="rounded-md border border-zinc-200 bg-white p-6">
        <h3 className="text-base font-semibold text-zinc-950">生成上架信息</h3>
        <p className="mt-1 text-sm text-zinc-500">
          所有 AI 调用都走后端接口，API Key 不会暴露到前端。
        </p>

        <form onSubmit={submitGenerate} className="mt-5 space-y-4">
          <div>
            <label htmlFor="provider" className="block text-sm font-medium text-zinc-950">
              AI Provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value as AiProvider)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="qwen">qwen</option>
              <option value="doubao">doubao</option>
            </select>
          </div>

          <div>
            <label htmlFor="product-draft" className="block text-sm font-medium text-zinc-950">
              商品草稿（可选）
            </label>
            <select
              id="product-draft"
              value={productDraftId}
              onChange={(event) => handleDraftChange(event.target.value)}
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="">不关联商品草稿</option>
              {productDrafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.title || draft.sku || draft.id} / {draft.status}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="product-type" className="block text-sm font-medium text-zinc-950">
                产品类型
              </label>
              <input
                id="product-type"
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                placeholder="T-shirt, hoodie, mug"
              />
            </div>

            <div>
              <label htmlFor="target-platform" className="block text-sm font-medium text-zinc-950">
                目标平台
              </label>
              <input
                id="target-platform"
                value={targetPlatform}
                onChange={(event) => setTargetPlatform(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                placeholder="Etsy, Amazon, Shopify"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="theme" className="block text-sm font-medium text-zinc-950">
                主题
              </label>
              <input
                id="theme"
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                placeholder="Camping, teacher gift, floral"
              />
            </div>

            <div>
              <label htmlFor="style" className="block text-sm font-medium text-zinc-950">
                风格
              </label>
              <input
                id="style"
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                placeholder="Vintage, cute, minimalist"
              />
            </div>
          </div>

          <div>
            <label htmlFor="image-description" className="block text-sm font-medium text-zinc-950">
              图片描述
            </label>
            <textarea
              id="image-description"
              value={imageDescription}
              onChange={(event) => setImageDescription(event.target.value)}
              rows={6}
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 text-zinc-900"
              placeholder="Describe the design image, text, colors, objects, audience, and mood."
            />
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isGenerating}
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isGenerating ? "生成中..." : "生成上架信息"}
          </button>
        </form>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h3 className="text-base font-semibold text-zinc-950">生成结果</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {generationId ? `已保存记录：${generationId}` : "结果会以严格 JSON 展示。"}
          </p>
        </div>

        {result ? (
          <div className="space-y-5 p-6">
            <div>
              <p className="text-sm font-medium text-zinc-500">Title</p>
              <p className="mt-1 text-lg font-semibold text-zinc-950">{result.title}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Description</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-zinc-700">
                {result.description}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-zinc-500">Tags</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.tags.map((tag) => (
                    <span key={tag} className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">SEO Keywords</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.seo_keywords.map((keyword) => (
                    <span key={keyword} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Bullet Points</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-zinc-700">
                {result.bullet_points.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">SKU Prefix</p>
              <p className="mt-1 font-mono text-sm font-semibold text-zinc-950">
                {result.sku_prefix}
              </p>
            </div>
            <pre className="max-h-96 overflow-auto rounded-md bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
              {resultToJson(result)}
            </pre>
          </div>
        ) : (
          <div className="p-8 text-sm text-zinc-500">
            填写左侧表单后生成英文商品标题、描述、标签、卖点、SEO 关键词和 SKU 前缀。
          </div>
        )}
      </section>
    </div>
  );
}
