"use client";

import { type FormEvent, useMemo, useState } from "react";

import { fetchProducts } from "@/lib/actions/products";

import type {
  MockupOutputOption,
  ProductAssetOption,
  ProductDraftStatus,
  ProductDraftView,
} from "@/lib/products/types";

type ProductsManagerProps = {
  assetOptions: ProductAssetOption[];
  initialError?: string | null;
  mockupOutputOptions: MockupOutputOption[];
  products: ProductDraftView[];
};

type ProductsResponse = {
  error?: string;
  product_id?: string;
  products?: ProductDraftView[];
};

type SaveResponse = {
  error?: string;
  ok?: boolean;
};

type ProductImagesZipResponse = {
  count?: number;
  download_url?: string;
  error?: string;
  filename?: string;
};

type SourceType = "asset" | "mockup_output";

const statusOptions: ProductDraftStatus[] = ["draft", "ready", "exported", "failed"];

const statusLabels: Record<ProductDraftStatus, string> = {
  draft: "草稿",
  exported: "已导出",
  failed: "失败",
  ready: "待导出",
};

const statusStyles: Record<ProductDraftStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  exported: "bg-sky-50 text-sky-700",
  failed: "bg-red-50 text-red-700",
  ready: "bg-emerald-50 text-emerald-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function toLines(value: string[]) {
  return value.join("\n");
}

export function ProductsManager({
  assetOptions,
  initialError = null,
  mockupOutputOptions,
  products: initialProducts,
}: ProductsManagerProps) {
  const [products, setProducts] = useState<ProductDraftView[]>(initialProducts);
  const [selectedProductId, setSelectedProductId] = useState(initialProducts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const [imageZipResult, setImageZipResult] = useState<ProductImagesZipResponse | null>(null);

  const [sourceType, setSourceType] = useState<SourceType>("mockup_output");
  const [assetId, setAssetId] = useState(assetOptions[0]?.id ?? "");
  const [mockupOutputId, setMockupOutputId] = useState(mockupOutputOptions[0]?.id ?? "");
  const [createTitle, setCreateTitle] = useState("");
  const [createSku, setCreateSku] = useState("");
  const [createProductType, setCreateProductType] = useState("");
  const [createPrice, setCreatePrice] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId],
  );
  const visibleProducts = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
      [
        product.title,
        product.sku,
        product.product_type,
        product.status,
        product.id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
      );
  }, [products, searchQuery]);
  const selectedProductImages = useMemo(
    () =>
      selectedProduct
        ? selectedProduct.images.length > 0
          ? selectedProduct.images
          : selectedProduct.main_image_url
            ? [selectedProduct.main_image_url]
            : []
        : [],
    [selectedProduct],
  );

  const [editTitle, setEditTitle] = useState(selectedProduct?.title ?? "");
  const [editDescription, setEditDescription] = useState(selectedProduct?.description ?? "");
  const [editTags, setEditTags] = useState(toLines(selectedProduct?.tags ?? []));
  const [editBulletPoints, setEditBulletPoints] = useState(
    toLines(selectedProduct?.bullet_points ?? []),
  );
  const [editSku, setEditSku] = useState(selectedProduct?.sku ?? "");
  const [editPrice, setEditPrice] = useState(
    selectedProduct?.price === null || selectedProduct?.price === undefined
      ? ""
      : String(selectedProduct.price),
  );
  const [editProductType, setEditProductType] = useState(selectedProduct?.product_type ?? "");
  const [editStatus, setEditStatus] = useState<ProductDraftStatus>(
    selectedProduct?.status ?? "draft",
  );

  function loadProductIntoEditor(product: ProductDraftView, clearFeedback = true) {
    setSelectedProductId(product.id);
    setEditTitle(product.title ?? "");
    setEditDescription(product.description ?? "");
    setEditTags(toLines(product.tags));
    setEditBulletPoints(toLines(product.bullet_points));
    setEditSku(product.sku ?? "");
    setEditPrice(product.price === null ? "" : String(product.price));
    setEditProductType(product.product_type ?? "");
    setEditStatus(product.status);
    setImageZipResult(null);

    if (clearFeedback) {
      setError(null);
      setMessage(null);
    }
  }

  async function refreshProducts(selectProductId?: string) {
    setIsRefreshing(true);
    setError(null);

    try {
      const data = await fetchProducts();
      if (data.error) throw new Error(data.error);

      const nextProducts = (data.products ?? []) as ProductDraftView[];
      setProducts(nextProducts);

      const nextSelected =
        nextProducts.find((product) => product.id === (selectProductId ?? selectedProductId)) ??
        nextProducts[0] ??
        null;

      if (nextSelected) {
        loadProductIntoEditor(nextSelected, false);
      } else {
        setSelectedProductId("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? "网络请求失败，请将 localhost 加入代理排除列表后重试" : requestError.message) : "读取商品草稿失败");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/products", {
        body: JSON.stringify({
          asset_id: sourceType === "asset" ? assetId : null,
          mockup_output_id: sourceType === "mockup_output" ? mockupOutputId : null,
          price: createPrice,
          product_type: createProductType,
          sku: createSku,
          source: sourceType,
          title: createTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as ProductsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "商品草稿创建失败");
      }

      setProducts(data.products ?? []);
      setCreateTitle("");
      setCreateSku("");
      setCreateProductType("");
      setCreatePrice("");
      setMessage("商品草稿创建成功");

      if (data.product_id) {
        const created = (data.products ?? []).find((product) => product.id === data.product_id);

        if (created) {
          loadProductIntoEditor(created, false);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? "网络请求失败，请将 localhost 加入代理排除列表后重试" : requestError.message) : "商品草稿创建失败");
    } finally {
      setIsCreating(false);
    }
  }

  async function saveProduct(nextStatus?: ProductDraftStatus) {
    if (!selectedProduct) {
      setError("请选择一个商品草稿");
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const statusToSave = nextStatus ?? editStatus;
      const response = await fetch(`/api/products/${selectedProduct.id}`, {
        body: JSON.stringify({
          bullet_points: editBulletPoints,
          description: editDescription,
          price: editPrice,
          product_type: editProductType,
          sku: editSku,
          status: statusToSave,
          tags: editTags,
          title: editTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      const data = (await response.json()) as SaveResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "商品草稿保存失败");
      }

      setEditStatus(statusToSave);
      setMessage(nextStatus === "ready" ? "商品草稿已标记为 ready" : "商品草稿保存成功");
      await refreshProducts(selectedProduct.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? "网络请求失败，请将 localhost 加入代理排除列表后重试" : requestError.message) : "商品草稿保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadProductImages(product: ProductDraftView) {
    if (product.images.length === 0 && !product.main_image_url) {
      setError("该商品没有图片，无法下载");
      setMessage(null);
      setImageZipResult(null);
      return;
    }

    setIsDownloadingImages(true);
    setError(null);
    setMessage(null);
    setImageZipResult(null);

    try {
      const response = await fetch(`/api/products/${product.id}/images-zip`, {
        method: "POST",
      });
      const data = (await response.json()) as ProductImagesZipResponse;

      if (!response.ok || !data.download_url) {
        throw new Error(data.error ?? "下载商品套图失败");
      }

      setImageZipResult(data);
      setMessage("商品套图 ZIP 已生成");
    } catch (requestError) {
      setError(requestError instanceof Error ? (requestError.message.includes("fetch") ? "网络请求失败，请将 localhost 加入代理排除列表后重试" : requestError.message) : "下载商品套图失败");
    } finally {
      setIsDownloadingImages(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-md border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">创建商品草稿</h3>
              <p className="mt-1 text-sm text-zinc-500">可从素材或套图结果创建。</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshProducts()}
              disabled={isRefreshing}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {isRefreshing ? "刷新中..." : "刷新列表"}
            </button>
          </div>

          <form onSubmit={createProduct} className="mt-5 grid gap-4 lg:grid-cols-2">
            <div>
              <label htmlFor="source-type" className="block text-sm font-medium text-zinc-950">
                创建来源
              </label>
              <select
                id="source-type"
                value={sourceType}
                onChange={(event) => setSourceType(event.target.value as SourceType)}
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              >
                <option value="mockup_output">从套图结果创建</option>
                <option value="asset">从素材创建</option>
              </select>
            </div>

            {sourceType === "mockup_output" ? (
              <div>
                <label htmlFor="mockup-output" className="block text-sm font-medium text-zinc-950">
                  套图结果
                </label>
                <select
                  id="mockup-output"
                  value={mockupOutputId}
                  onChange={(event) => setMockupOutputId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {mockupOutputOptions.length === 0 ? <option value="">暂无套图结果</option> : null}
                  {mockupOutputOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id} / {option.output_images.length} 张图 / {option.status}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="asset" className="block text-sm font-medium text-zinc-950">
                  素材图片
                </label>
                <select
                  id="asset"
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {assetOptions.length === 0 ? <option value="">暂无素材</option> : null}
                  {assetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.filename}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="create-title" className="block text-sm font-medium text-zinc-950">
                标题
              </label>
              <input
                id="create-title"
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div>
              <label htmlFor="create-sku" className="block text-sm font-medium text-zinc-950">
                SKU
              </label>
              <input
                id="create-sku"
                value={createSku}
                onChange={(event) => setCreateSku(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div>
              <label htmlFor="create-product-type" className="block text-sm font-medium text-zinc-950">
                产品类型
              </label>
              <input
                id="create-product-type"
                value={createProductType}
                onChange={(event) => setCreateProductType(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div>
              <label htmlFor="create-price" className="block text-sm font-medium text-zinc-950">
                价格
              </label>
              <input
                id="create-price"
                value={createPrice}
                onChange={(event) => setCreatePrice(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                inputMode="decimal"
              />
            </div>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={isCreating}
                className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isCreating ? "创建中..." : "创建商品草稿"}
              </button>
            </div>
          </form>

          {error ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}
        </section>

        <section className="rounded-md border border-zinc-200 bg-white">
          <div className="grid gap-4 border-b border-zinc-200 px-5 py-4 md:grid-cols-[1fr_260px]">
            <div>
              <h3 className="text-base font-semibold text-zinc-950">商品草稿列表</h3>
              <p className="mt-1 text-sm text-zinc-500">
                共 {products.length} 个草稿，当前显示 {visibleProducts.length} 个
              </p>
            </div>
            <div>
              <label htmlFor="product-search" className="sr-only">
                搜索商品草稿
              </label>
              <input
                id="product-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索标题、SKU、类型"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>
          </div>

          {products.length === 0 ? (
            <div className="p-8 text-sm text-zinc-500">暂无商品草稿。</div>
          ) : visibleProducts.length === 0 ? (
            <div className="p-8 text-sm text-zinc-500">没有匹配的商品草稿。</div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {visibleProducts.map((product) => {
                const isSelected = selectedProduct?.id === product.id;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => loadProductIntoEditor(product)}
                    className={[
                      "grid w-full gap-4 px-5 py-4 text-left transition hover:bg-zinc-50 md:grid-cols-[96px_1fr_auto]",
                      isSelected ? "bg-emerald-50/70" : "",
                    ].join(" ")}
                  >
                    {product.main_image_url ? (
                      <span
                        className="block aspect-square rounded-md bg-zinc-100 bg-cover bg-center"
                        style={{ backgroundImage: `url("${product.main_image_url}")` }}
                      />
                    ) : (
                      <span className="flex aspect-square items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-400">
                        无图片
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-950">
                        {product.title || "未填写标题"}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        SKU：{product.sku || "-"} · 类型：{product.product_type || "-"} · 价格：
                        {formatPrice(product.price)}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        创建时间：{formatDate(product.created_at)}
                      </span>
                    </span>
                    <span className="self-start">
                      <span
                        className={[
                          "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                          statusStyles[product.status],
                        ].join(" ")}
                      >
                        {statusLabels[product.status]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h3 className="text-base font-semibold text-zinc-950">编辑商品草稿</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {selectedProduct ? selectedProduct.id : "请选择一个商品草稿"}
          </p>
        </div>

        {!selectedProduct ? (
          <div className="p-8 text-sm text-zinc-500">暂无可编辑的商品草稿。</div>
        ) : (
          <div className="space-y-5 p-5">
            <div>
              <label htmlFor="edit-title" className="block text-sm font-medium text-zinc-950">
                标题
              </label>
              <input
                id="edit-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div>
              <label htmlFor="edit-description" className="block text-sm font-medium text-zinc-950">
                描述
              </label>
              <textarea
                id="edit-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={6}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 text-zinc-900"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-sku" className="block text-sm font-medium text-zinc-950">
                  SKU
                </label>
                <input
                  id="edit-sku"
                  value={editSku}
                  onChange={(event) => setEditSku(event.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="edit-price" className="block text-sm font-medium text-zinc-950">
                  价格
                </label>
                <input
                  id="edit-price"
                  value={editPrice}
                  onChange={(event) => setEditPrice(event.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  inputMode="decimal"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-product-type" className="block text-sm font-medium text-zinc-950">
                  产品类型
                </label>
                <input
                  id="edit-product-type"
                  value={editProductType}
                  onChange={(event) => setEditProductType(event.target.value)}
                  className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                />
              </div>

              <div>
                <label htmlFor="edit-status" className="block text-sm font-medium text-zinc-950">
                  状态
                </label>
                <select
                  id="edit-status"
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as ProductDraftStatus)}
                  className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="edit-tags" className="block text-sm font-medium text-zinc-950">
                标签
              </label>
              <textarea
                id="edit-tags"
                value={editTags}
                onChange={(event) => setEditTags(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 text-zinc-900"
                placeholder="每行一个，或用逗号分隔"
              />
            </div>

            <div>
              <label htmlFor="edit-bullets" className="block text-sm font-medium text-zinc-950">
                Bullet Points
              </label>
              <textarea
                id="edit-bullets"
                value={editBulletPoints}
                onChange={(event) => setEditBulletPoints(event.target.value)}
                rows={5}
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm leading-6 text-zinc-900"
                placeholder="每行一个，或用逗号分隔"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-950">商品图片</p>
                <button
                  type="button"
                  onClick={() => void downloadProductImages(selectedProduct)}
                  disabled={isDownloadingImages}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
                >
                  {isDownloadingImages ? "打包中..." : "下载套图 ZIP"}
                </button>
              </div>
              {selectedProductImages.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">暂无商品图片。</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selectedProductImages.map((url, index) => (
                    <a
                      key={`${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border border-zinc-200"
                    >
                      <span
                        className="block aspect-square bg-zinc-100 bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url("${url}")` }}
                      />
                      <span className="block border-t border-zinc-200 px-3 py-2 text-sm text-zinc-700">
                        图片 {index + 1}
                      </span>
                    </a>
                  ))}
                </div>
              )}
              {imageZipResult?.download_url ? (
                <a
                  href={imageZipResult.download_url}
                  download
                  className="mt-3 block rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 transition hover:bg-emerald-100"
                >
                  下载文件：{imageZipResult.filename}
                </a>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void saveProduct()}
                disabled={isSaving}
                className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSaving ? "保存中..." : "保存修改"}
              </button>
              <button
                type="button"
                onClick={() => void saveProduct("ready")}
                disabled={isSaving}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                标记为 ready
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
