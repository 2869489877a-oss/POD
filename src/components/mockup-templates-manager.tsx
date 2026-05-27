"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";

import {
  parseScenesJson,
  sampleScenes,
  type MockupScene,
} from "@/lib/mockups/scenes";

export type MockupTemplate = {
  created_at: string;
  id: string;
  name: string;
  product_type: string;
  scenes: MockupScene[];
  status: string;
  updated_at: string;
};

type DeleteTemplateResponse = {
  error?: string;
  ok?: boolean;
  output_count?: number;
  requires_confirmation?: boolean;
};

type CreateTemplateResponse = {
  error?: string;
  template?: MockupTemplate;
};

type UploadBackgroundResult = {
  error?: string;
  filename: string;
  success: boolean;
  url?: string;
};

type UploadBackgroundResponse = {
  error?: string;
  results?: UploadBackgroundResult[];
};

type PreviewResult = {
  error?: string;
  name: string;
  success: boolean;
  url?: string;
};

type PreviewResponse = {
  error?: string;
  previews?: PreviewResult[];
};

type DeleteTemplateResponse = {
  error?: string;
  ok?: boolean;
  output_count?: number;
  requires_confirmation?: boolean;
};

type MockupTemplatesManagerProps = {
  initialError?: string | null;
  initialTemplates: MockupTemplate[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createSceneFromBackground(url: string, name: string) {
  return {
    background_url: url,
    name,
    need_print: true,
    output_height: 2000,
    output_width: 2000,
    print_area: {
      height: 600,
      width: 500,
      x: 400,
      y: 300,
    },
  };
}

export function MockupTemplatesManager({
  initialError = null,
  initialTemplates,
}: MockupTemplatesManagerProps) {
  const [templates, setTemplates] = useState<MockupTemplate[]>(initialTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<MockupTemplate | null>(
    initialTemplates[0] ?? null,
  );
  const [name, setName] = useState("");
  const [productType, setProductType] = useState("");
  const [scenesText, setScenesText] = useState(JSON.stringify(sampleScenes, null, 2));
  const [backgroundFiles, setBackgroundFiles] = useState<File[]>([]);
  const [backgroundResults, setBackgroundResults] = useState<UploadBackgroundResult[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewResults, setPreviewResults] = useState<PreviewResult[]>([]);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploadingBackgrounds, setIsUploadingBackgrounds] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const selectedScenes = useMemo(() => selectedTemplate?.scenes ?? [], [selectedTemplate]);

  function handleBackgroundFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setBackgroundFiles(Array.from(event.target.files ?? []));
    setBackgroundResults([]);
  }

  function handlePreviewFileChange(event: ChangeEvent<HTMLInputElement>) {
    setPreviewFile(event.target.files?.[0] ?? null);
    setPreviewResults([]);
  }

  async function refreshTemplates() {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/mockup-templates", { cache: "no-store" });
      const data = (await response.json()) as TemplatesResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "读取模板失败");
      }

      const nextTemplates = data.templates ?? [];
      setTemplates(nextTemplates);
      setSelectedTemplate((current) => {
        if (!current) {
          return nextTemplates[0] ?? null;
        }

        return nextTemplates.find((template) => template.id === current.id) ?? nextTemplates[0] ?? null;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "读取模板失败");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function uploadBackgrounds() {
    if (backgroundFiles.length === 0) {
      setError("请选择至少一张场景底图");
      return;
    }

    setIsUploadingBackgrounds(true);
    setError(null);
    setMessage(null);

    const formData = new FormData();
    backgroundFiles.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/mockup-templates/backgrounds", {
        body: formData,
        method: "POST",
      });
      const data = (await response.json()) as UploadBackgroundResponse;

      setBackgroundResults(data.results ?? []);

      if (!response.ok) {
        throw new Error(data.error ?? "底图上传失败");
      }

      setMessage("场景底图上传完成，可插入到 scenes JSON。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "底图上传失败");
    } finally {
      setIsUploadingBackgrounds(false);
    }
  }

  function insertBackgroundScene(result: UploadBackgroundResult) {
    if (!result.url) {
      return;
    }

    try {
      const scenes = parseScenesJson(scenesText);
      const nextScenes = [
        ...scenes,
        createSceneFromBackground(result.url, result.filename.replace(/\.[^.]+$/, "")),
      ];
      setScenesText(JSON.stringify(nextScenes, null, 2));
      setError(null);
    } catch {
      const nextScenes = [createSceneFromBackground(result.url, result.filename.replace(/\.[^.]+$/, ""))];
      setScenesText(JSON.stringify(nextScenes, null, 2));
      setError(null);
    }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    let scenes: MockupScene[];

    try {
      scenes = parseScenesJson(scenesText);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "scenes JSON 不合法");
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/mockup-templates", {
        body: JSON.stringify({
          name,
          product_type: productType,
          scenes,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as CreateTemplateResponse;

      if (!response.ok || !data.template) {
        throw new Error(data.error ?? "模板保存失败");
      }

      setTemplates((current) => [data.template!, ...current]);
      setSelectedTemplate(data.template);
      setName("");
      setProductType("");
      setScenesText(JSON.stringify(sampleScenes, null, 2));
      setMessage("模板保存成功");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模板保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function generatePreview() {
    if (!selectedTemplate) {
      setError("请先选择一个模板");
      return;
    }

    if (!previewFile) {
      setError("请上传一张测试印花图");
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setPreviewResults([]);

    const formData = new FormData();
    formData.append("print_image", previewFile);

    try {
      const response = await fetch(`/api/mockup-templates/${selectedTemplate.id}/preview`, {
        body: formData,
        method: "POST",
      });
      const data = (await response.json()) as PreviewResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "生成预览失败");
      }

      setPreviewResults(data.previews ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成预览失败");
    } finally {
      setIsPreviewing(false);
    }
  }

 async function deleteTemplate(template: MockupTemplate) {
  setDeletingTemplateId(template.id);
  setError(null);
  setMessage(null);

  try {
    const checkResponse = await fetch(`/api/mockup-templates/${template.id}`, {
      body: JSON.stringify({ dry_run: true }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "DELETE",
    });
    const checkData = (await checkResponse.json()) as DeleteTemplateResponse;

    if (!checkResponse.ok) {
      throw new Error(checkData.error ?? "删除检查失败");
    }

    const confirmed = window.confirm(
      checkData.requires_confirmation
        ? "该模板已有套图生成记录，删除可能影响历史套图。是否继续？"
        : "确定要删除这个套图模板吗？删除后不可恢复。",
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/mockup-templates/${template.id}`, {
      body: JSON.stringify({
        force: checkData.requires_confirmation === true,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "DELETE",
    });
    const data = (await response.json()) as DeleteTemplateResponse;

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? "模板删除失败");
    }

    setMessage("模板删除成功");
    setPreviewResults([]);
    await refreshTemplates();
  } catch (requestError) {
    setError(requestError instanceof Error ? requestError.message : "模板删除失败");
  } finally {
    setDeletingTemplateId(null);
  }
}

    try {
      const checkResponse = await fetch(`/api/mockup-templates/${template.id}`, {
        body: JSON.stringify({ dry_run: true }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      const checkData = (await checkResponse.json()) as DeleteTemplateResponse;

      if (!checkResponse.ok) {
        throw new Error(checkData.error ?? "删除检查失败");
      }

      const confirmed = window.confirm(
        checkData.requires_confirmation
          ? "该模板已有套图生成记录，删除可能影响历史套图。是否继续？"
          : "确定要删除这个套图模板吗？删除后不可恢复。",
      );

      if (!confirmed) {
        return;
      }

      const response = await fetch(`/api/mockup-templates/${template.id}`, {
        body: JSON.stringify({
          force: checkData.requires_confirmation === true,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "DELETE",
      });
      const data = (await response.json()) as DeleteTemplateResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "模板删除失败");
      }

      setMessage("模板删除成功");
      setPreviewResults([]);
      await refreshTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模板删除失败");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  return (
   <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
     <div className="order-1 space-y-6 xl:order-2">
        <section className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">创建套图模板</h3>
              <p className="mt-1 text-sm text-zinc-500">使用 JSON 配置场景和印花坐标。</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshTemplates()}
              disabled={isRefreshing}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isRefreshing ? "刷新中..." : "刷新模板"}
            </button>
          </div>

          <form onSubmit={saveTemplate} className="mt-5 space-y-4">
            <div>
              <label htmlFor="template-name" className="block text-sm font-medium text-zinc-950">
                模板名称
              </label>
              <input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                placeholder="例如：T恤白底套图"
              />
            </div>

            <div>
              <label htmlFor="product-type" className="block text-sm font-medium text-zinc-950">
                产品类型
              </label>
              <input
                id="product-type"
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                placeholder="例如：T恤"
              />
            </div>

            <div>
              <label htmlFor="scenes-json" className="block text-sm font-medium text-zinc-950">
                scenes JSON
              </label>
              <textarea
                id="scenes-json"
                value={scenesText}
                onChange={(event) => setScenesText(event.target.value)}
                rows={18}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs leading-5 text-zinc-900"
              />
            </div>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isSaving ? "保存中..." : "保存模板"}
            </button>
          </form>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-5">
          <h3 className="text-base font-semibold text-zinc-950">上传场景底图</h3>
          <p className="mt-1 text-sm text-zinc-500">上传后可插入为 scenes JSON 中的新场景。</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              multiple
              onChange={handleBackgroundFilesChange}
              className="block min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            <button
              type="button"
              onClick={() => void uploadBackgrounds()}
              disabled={isUploadingBackgrounds || backgroundFiles.length === 0}
              className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isUploadingBackgrounds ? "上传中..." : "上传底图"}
            </button>
          </div>

          {backgroundResults.length > 0 ? (
            <div className="mt-4 divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {backgroundResults.map((result) => (
                <div key={`${result.filename}-${result.url ?? result.error}`} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-950">
                        {result.filename}
                      </p>
                      {result.url ? (
                        <p className="mt-1 break-all text-xs text-zinc-500">{result.url}</p>
                      ) : (
                        <p className="mt-1 text-xs text-red-600">{result.error}</p>
                      )}
                    </div>
                    {result.url ? (
                      <button
                        type="button"
                        onClick={() => insertBackgroundScene(result)}
                        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                      >
                        插入场景
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="order-1 space-y-6 xl:order-2">
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h3 className="text-base font-semibold text-zinc-950">模板列表</h3>
            <p className="mt-1 text-sm text-zinc-500">共 {templates.length} 个模板</p>
          </div>

          {templates.length === 0 ? (
            <div className="p-8 text-sm text-zinc-500">暂无套图模板。</div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {templates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;

                return (
                  <div
                    key={template.id}
                    className={[
                      "grid gap-3 px-5 py-4 transition sm:grid-cols-[1fr_auto]",
                      isSelected ? "bg-emerald-50/70" : "",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setPreviewResults([]);
                      }}
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-zinc-950">
                            {template.name}
                          </span>
                          <span className="mt-1 block text-xs text-zinc-500">
                            {template.product_type} · {template.scenes.length} 个场景
                          </span>
                        </span>
                        <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                          {template.status}
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center justify-end">
  <button
    type="button"
    onClick={() => void deleteTemplate(template)}
    disabled={deletingTemplateId !== null}
    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
  >
    {deletingTemplateId === template.id ? "删除中..." : "删除"}
  </button>
</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">模板详情</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {selectedTemplate ? selectedTemplate.name : "请选择一个模板"}
              </p>
            </div>
            {selectedTemplate ? (
  <button
    type="button"
    onClick={() => void deleteTemplate(selectedTemplate)}
    disabled={deletingTemplateId !== null}
    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
  >
    {deletingTemplateId === selectedTemplate.id ? "删除中..." : "删除当前模板"}
  </button>
) : null}
          </div>

          {!selectedTemplate ? (
            <div className="p-8 text-sm text-zinc-500">暂无可查看的模板详情。</div>
          ) : (
            <div className="space-y-5 p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">产品类型</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {selectedTemplate.product_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">创建时间</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {formatDate(selectedTemplate.created_at)}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-4 sm:grid-cols-2">
                {selectedScenes.map((scene) => (
                  <div key={`${scene.name}-${scene.background_url}`} className="rounded-md border border-zinc-200">
                    <div
                      className="aspect-square rounded-t-md bg-zinc-100 bg-cover bg-center"
                      style={{ backgroundImage: `url("${scene.background_url}")` }}
                    />
                    <div className="space-y-2 p-3 text-sm">
                      <p className="font-semibold text-zinc-950">{scene.name}</p>
                      <p className="text-zinc-500">
                        输出：{scene.output_width} x {scene.output_height}
                      </p>
                      <p className="text-zinc-500">
                        {scene.need_print ? "需要叠加印花" : "固定底图输出"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <pre className="max-h-72 overflow-auto rounded-md bg-zinc-950 p-4 text-xs leading-5 text-zinc-100">
                {JSON.stringify(selectedTemplate.scenes, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-5">
          <h3 className="text-base font-semibold text-zinc-950">测试印花预览</h3>
          <p className="mt-1 text-sm text-zinc-500">
            上传一张测试印花，按当前模板生成预览图。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handlePreviewFileChange}
              className="block min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            <button
              type="button"
              onClick={() => void generatePreview()}
              disabled={isPreviewing || !selectedTemplate}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {isPreviewing ? "生成中..." : "生成预览"}
            </button>
          </div>

          {previewResults.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {previewResults.map((preview) => (
                <div key={`${preview.name}-${preview.url ?? preview.error}`} className="rounded-md border border-zinc-200">
                  {preview.url ? (
                    <a
                      href={preview.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square rounded-t-md bg-zinc-100 bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${preview.url}")` }}
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-t-md bg-red-50 p-4 text-center text-sm text-red-700">
                      {preview.error}
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold text-zinc-950">{preview.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {preview.success ? "预览生成成功" : "预览生成失败"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
