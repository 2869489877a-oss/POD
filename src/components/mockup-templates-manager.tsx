"use client";

import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";

import { deleteTemplateAction, fetchTemplatesAction, saveTemplateAction } from "@/lib/actions/mockup-templates";
import {
  sampleScenes,
  type MockupScene,
  type PrintArea,
} from "@/lib/mockups/scenes";
import { SceneEditor } from "@/components/scene-editor";
import { useSettings } from "@/lib/settings/context";

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

type TemplatesResponse = {
  error?: string;
  templates?: MockupTemplate[];
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


type MockupTemplatesManagerProps = {
  initialError?: string | null;
  initialTemplates: MockupTemplate[];
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type SceneDraft = {
  background_url: string;
  local_id: string;
  name: string;
  need_print: boolean;
  output_height: number;
  output_width: number;
  print_area: PrintArea;
};

function createLocalId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlankScene(): SceneDraft {
  return {
    background_url: "",
    local_id: createLocalId(),
    name: "",
    need_print: true,
    output_height: 2000,
    output_width: 2000,
    print_area: { x: 400, y: 300, width: 500, height: 600 },
  };
}

function createSceneFromBackground(url: string, name: string): SceneDraft {
  return {
    background_url: url,
    local_id: createLocalId(),
    name,
    need_print: true,
    output_height: 2000,
    output_width: 2000,
    print_area: { x: 400, y: 300, width: 500, height: 600 },
  };
}

function scenesToPayload(scenes: SceneDraft[]): MockupScene[] {
  return scenes.map((s) => {
    const base: MockupScene = {
      background_url: s.background_url,
      name: s.name,
      need_print: s.need_print,
      output_height: s.output_height,
      output_width: s.output_width,
    };
    if (s.need_print) {
      base.print_area = { ...s.print_area };
    }
    return base;
  });
}

function sampleToDrafts(): SceneDraft[] {
  return sampleScenes.map((s) => ({
    background_url: s.background_url,
    local_id: createLocalId(),
    name: s.name,
    need_print: s.need_print,
    output_height: s.output_height,
    output_width: s.output_width,
    print_area: s.print_area ?? { x: 400, y: 300, width: 500, height: 600 },
  }));
}

export function MockupTemplatesManager({
  initialError = null,
  initialTemplates,
}: MockupTemplatesManagerProps) {
  const { language, t } = useSettings();
  const [templates, setTemplates] = useState<MockupTemplate[]>(initialTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<MockupTemplate | null>(
    initialTemplates[0] ?? null,
  );
  const [name, setName] = useState("");
  const [productType, setProductType] = useState("");
  const [scenes, setScenes] = useState<SceneDraft[]>(sampleToDrafts());
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
      const data = await fetchTemplatesAction();

      if (data.error) {
        throw new Error(data.error);
      }

      const nextTemplates = (data.templates ?? []) as MockupTemplate[];
      setTemplates(nextTemplates);
      setSelectedTemplate((current) => {
        if (!current) {
          return nextTemplates[0] ?? null;
        }

        return nextTemplates.find((template) => template.id === current.id) ?? nextTemplates[0] ?? null;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("读取模板失败", "Failed to load templates"));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function uploadBackgrounds() {
    if (backgroundFiles.length === 0) {
      setError(t("请选择至少一张场景底图", "Please choose at least one scene background"));
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
        throw new Error(data.error ?? t("底图上传失败", "Background upload failed"));
      }

      setMessage(t("场景底图上传完成，可插入到 scenes JSON。", "Scene backgrounds uploaded and can be inserted into scenes JSON."));
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? t("网络请求失败，请将 localhost 加入代理排除列表后重试", "Network request failed. Add localhost to your proxy bypass list and try again.") : requestError.message) : t("底图上传失败", "Background upload failed"));
    } finally {
      setIsUploadingBackgrounds(false);
    }
  }

  function insertBackgroundScene(result: UploadBackgroundResult) {
    if (!result.url) return;
    setScenes((current) => [
      ...current,
      createSceneFromBackground(result.url!, result.filename.replace(/\.[^.]+$/, "")),
    ]);
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setMessage(null);

    const validScenes = scenes.filter((s) => s.name.trim() && s.background_url.trim());
    if (validScenes.length === 0) {
      setError(t("请至少添加一个有效场景（需要名称和底图 URL）", "Please add at least one valid scene with a name and background URL"));
      setIsSaving(false);
      return;
    }

    try {
      const data = await saveTemplateAction({
        name,
        product_type: productType,
        scenes: scenesToPayload(validScenes),
      });

      if (data.error || !data.template) {
        throw new Error(data.error ?? t("模板保存失败", "Template save failed"));
      }

      const saved = data.template as MockupTemplate;
      setTemplates((current) => [saved, ...current]);
      setSelectedTemplate(saved);
      setName("");
      setProductType("");
      setScenes(sampleToDrafts());
      setMessage(t("模板保存成功", "Template saved"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("模板保存失败", "Template save failed"));
    } finally {
      setIsSaving(false);
    }
  }

  async function generatePreview() {
    if (!selectedTemplate) {
      setError(t("请先选择一个模板", "Please select a template first"));
      return;
    }

    if (!previewFile) {
      setError(t("请上传一张测试印花图", "Please upload a test print image"));
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
        throw new Error(data.error ?? t("生成预览失败", "Preview generation failed"));
      }

      setPreviewResults(data.previews ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? t("网络请求失败，请将 localhost 加入代理排除列表后重试", "Network request failed. Add localhost to your proxy bypass list and try again.") : requestError.message) : t("生成预览失败", "Preview generation failed"));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function deleteTemplate(template: MockupTemplate) {
    setDeletingTemplateId(template.id);
    setError(null);
    setMessage(null);

    try {
      const checkData = await deleteTemplateAction(template.id, { dry_run: true });

      if (checkData.error) {
        throw new Error(checkData.error);
      }

      const confirmed = window.confirm(
        checkData.requires_confirmation
          ? t("该模板已有套图生成记录，删除可能影响历史套图。是否继续？", "This template has generated mockup records. Deleting it may affect historical mockups. Continue?")
          : t("确定要删除这个套图模板吗？删除后不可恢复。", "Delete this mockup template? This cannot be undone."),
      );

      if (!confirmed) {
        return;
      }

      const data = await deleteTemplateAction(template.id, {
        force: checkData.requires_confirmation === true,
      });

      if (!data.ok) {
        throw new Error(data.error ?? t("模板删除失败", "Template deletion failed"));
      }

      setMessage(t("模板删除成功", "Template deleted"));
      setPreviewResults([]);
      await refreshTemplates();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("模板删除失败", "Template deletion failed"));
    } finally {
      setDeletingTemplateId(null);
    }
  }

  return (
   <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
     <div className="space-y-4 xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto">
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">{t("创建套图模板", "Create Mockup Template")}</h3>
              <p className="mt-1 text-sm text-zinc-500">{t("可视化配置场景和印花坐标，拖拽调整位置。", "Visually configure scenes and print coordinates by dragging the placement box.")}</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshTemplates()}
              disabled={isRefreshing}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isRefreshing ? t("刷新中...", "Refreshing...") : t("刷新模板", "Refresh Templates")}
            </button>
          </div>

          <form onSubmit={saveTemplate} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="template-name" className="block text-sm font-medium text-zinc-950">
                  {t("模板名称", "Template Name")}
                </label>
                <input
                  id="template-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900"
                  placeholder={t("例如：T恤白底套图", "e.g. White background T-shirt mockup")}
                />
              </div>

              <div>
                <label htmlFor="product-type" className="block text-sm font-medium text-zinc-950">
                  {t("产品类型", "Product Type")}
                </label>
                <input
                  id="product-type"
                  value={productType}
                  onChange={(event) => setProductType(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900"
                  placeholder={t("例如：T恤", "e.g. T-shirt")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-950">{t("场景列表", "Scene List")}</span>
                <button
                  type="button"
                  onClick={() => setScenes((c) => [...c, createBlankScene()])}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                >
                  {t("添加场景", "Add Scene")}
                </button>
              </div>

              {scenes.map((scene, index) => (
                <div key={scene.local_id} className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-950">{t(`场景 ${index + 1}`, `Scene ${index + 1}`)}</span>
                    <button
                      type="button"
                      onClick={() => setScenes((c) => c.filter((_, i) => i !== index))}
                      disabled={scenes.length === 1}
                      className="text-sm font-medium text-red-600 disabled:cursor-not-allowed disabled:text-zinc-400"
                    >
                      {t("删除", "Delete")}
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-zinc-700">
                      {t("场景名称", "Scene Name")}
                      <input
                        value={scene.name}
                        onChange={(e) => setScenes((c) => c.map((s, i) => i === index ? { ...s, name: e.target.value } : s))}
                        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                        placeholder={t("例如：主图", "e.g. Main image")}
                      />
                    </label>
                    <label className="block text-sm font-medium text-zinc-700">
                      {t("底图 URL", "Background URL")}
                      <input
                        value={scene.background_url}
                        onChange={(e) => setScenes((c) => c.map((s, i) => i === index ? { ...s, background_url: e.target.value } : s))}
                        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                        placeholder={t("上传底图后自动填入", "Auto-filled after background upload")}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm font-medium text-zinc-700">
                      {t("输出宽度", "Output Width")}
                      <input
                        type="number"
                        value={scene.output_width}
                        onChange={(e) => setScenes((c) => c.map((s, i) => i === index ? { ...s, output_width: Number(e.target.value) || 2000 } : s))}
                        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm font-medium text-zinc-700">
                      {t("输出高度", "Output Height")}
                      <input
                        type="number"
                        value={scene.output_height}
                        onChange={(e) => setScenes((c) => c.map((s, i) => i === index ? { ...s, output_height: Number(e.target.value) || 2000 } : s))}
                        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end text-sm font-medium text-zinc-700">
                      <input
                        type="checkbox"
                        checked={scene.need_print}
                        onChange={(e) => setScenes((c) => c.map((s, i) => i === index ? { ...s, need_print: e.target.checked } : s))}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      {t("需要叠加印花", "Needs print overlay")}
                    </label>
                  </div>

                  {scene.need_print && scene.background_url && (
                    <div>
                      <p className="mb-2 text-xs text-zinc-500">{t("拖拽蓝色框调整印花位置和大小", "Drag the blue box to adjust print position and size")}</p>
                      <SceneEditor
                        backgroundUrl={scene.background_url}
                        outputWidth={scene.output_width}
                        outputHeight={scene.output_height}
                        printArea={scene.print_area}
                        onPrintAreaChange={(area) => setScenes((c) => c.map((s, i) => i === index ? { ...s, print_area: area } : s))}
                      />
                    </div>
                  )}

                  {scene.need_print && !scene.background_url && (
                    <p className="text-xs text-amber-600">{t("请先填入底图 URL 或上传底图，即可可视化编辑印花区域", "Enter or upload a background URL before visually editing the print area")}</p>
                  )}
                </div>
              ))}
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
              {isSaving ? t("保存中...", "Saving...") : t("保存模板", "Save Template")}
            </button>
          </form>
        </section>

        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-base font-semibold text-zinc-950">{t("上传场景底图", "Upload Scene Backgrounds")}</h3>
          <p className="mt-1 text-sm text-zinc-500">{t("上传后可插入为 scenes JSON 中的新场景。", "Uploaded backgrounds can be inserted as new scenes.")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
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
              {isUploadingBackgrounds ? t("上传中...", "Uploading...") : t("上传底图", "Upload Backgrounds")}
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
                        {t("插入场景", "Insert Scene")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="space-y-4 xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto">
        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-3">
            <h3 className="text-base font-semibold text-zinc-950">{t("模板列表", "Template List")}</h3>
            <p className="mt-1 text-sm text-zinc-500">{t(`共 ${templates.length} 个模板`, `${templates.length} templates`)}</p>
          </div>

          {templates.length === 0 ? (
            <div className="p-8 text-sm text-zinc-500">{t("暂无套图模板。", "No mockup templates yet.")}</div>
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
                            {template.product_type} · {t(`${template.scenes.length} 个场景`, `${template.scenes.length} scenes`)}
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
    {deletingTemplateId === template.id ? t("删除中...", "Deleting...") : t("删除", "Delete")}
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
              <h3 className="text-base font-semibold text-zinc-950">{t("模板详情", "Template Details")}</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {selectedTemplate ? selectedTemplate.name : t("请选择一个模板", "Please select a template")}
              </p>
            </div>
            {selectedTemplate ? (
  <button
    type="button"
    onClick={() => void deleteTemplate(selectedTemplate)}
    disabled={deletingTemplateId !== null}
    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
  >
    {deletingTemplateId === selectedTemplate.id ? t("删除中...", "Deleting...") : t("删除当前模板", "Delete Current Template")}
  </button>
) : null}
          </div>

          {!selectedTemplate ? (
            <div className="p-8 text-sm text-zinc-500">{t("暂无可查看的模板详情。", "No template details to view.")}</div>
          ) : (
            <div className="space-y-5 p-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">{t("产品类型", "Product Type")}</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {selectedTemplate.product_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">{t("创建时间", "Created At")}</dt>
                  <dd className="mt-1 font-medium text-zinc-950">
                    {formatDate(selectedTemplate.created_at, language === "zh" ? "zh-CN" : "en-US")}
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
                        {t("输出：", "Output: ")}{scene.output_width} x {scene.output_height}
                      </p>
                      <p className="text-zinc-500">
                        {scene.need_print ? t("需要叠加印花", "Needs print overlay") : t("固定底图输出", "Fixed background output")}
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

        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-base font-semibold text-zinc-950">{t("测试印花预览", "Test Print Preview")}</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {t("上传一张测试印花，按当前模板生成预览图。", "Upload a test print and generate previews with the current template.")}
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
              {isPreviewing ? t("生成中...", "Generating...") : t("生成预览", "Generate Preview")}
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
                      {preview.success ? t("预览生成成功", "Preview generated") : t("预览生成失败", "Preview failed")}
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
