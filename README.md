# POD 商品图批量处理系统

内部使用的 POD 商品图批量处理系统骨架，基于 Next.js、TypeScript 和 Tailwind CSS。

## 当前范围

- 基础项目初始化
- 左侧菜单后台布局
- 首页仪表盘
- 页面路由骨架
- Supabase 客户端接入
- Supabase 数据库 migration
- 图片批量上传到 Supabase Storage
- 上传成功后写入 `assets` 表
- 素材库列表、筛选、多选和详情弹窗
- 素材库批量改尺寸，生成 POD 标准尺寸图片
- 图片任务中心，查看任务列表和子任务明细
- 印花提取和一键抠图 MVP，基于 Sharp + TypeScript 像素算法批量生成透明底结果
- 简单版套图模板，支持 JSON 坐标配置和预览生成
- 批量商品套图，根据模板为多张素材生成商品图
- AI 生成商品上架信息，支持 qwen 和 doubao
- 商品草稿管理，支持创建、编辑、查看图片和标记 ready
- 导出中心，支持商品 Excel 和图片 ZIP
- 素材删除、失败任务重试、商品搜索、单商品套图下载和导出记录
- 暂不接入爬虫、支付、复杂权限和自动上架能力

## 页面路由

- `/dashboard` 仪表盘
- `/assets` 素材库管理
- `/upload` 上传图片
- `/image-jobs` 批量图片处理
- `/print-extraction` 印花提取
- `/cutout` 一键抠图
- `/mockup-templates` 固定商品套图
- `/mockup-jobs` 套图任务
- `/products` 商品草稿管理
- `/ai-generate` AI 文案生成
- `/exports` 导出管理
- `/settings` 设置

## 安装依赖

```bash
npm install
```

## 本地运行

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 部署文档

部署到 Vercel + Supabase 前，请先阅读：

```text
docs/DEPLOYMENT.md
```

该文档包含 GitHub、Supabase、Supabase Storage、数据库 migration、Vercel 环境变量、部署后测试和常见错误处理说明。

## Supabase 配置

项目已接入 Supabase JavaScript 客户端。复制 `.env.example` 为本地 `.env.local`，并填写 Supabase 项目配置：

```bash
cp .env.example .env.local
```

需要配置的环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_DEFAULT_PROVIDER=qwen
QWEN_API_KEY=
QWEN_MODEL=
QWEN_BASE_URL=
DOUBAO_API_KEY=
DOUBAO_MODEL=
DOUBAO_BASE_URL=
```

使用规则：

- 前端代码只能使用 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- `SUPABASE_SERVICE_ROLE_KEY` 只能在后端代码中使用，当前入口为 `src/lib/supabase/server.ts`。
- 不要提交真实 `.env`、`.env.local` 或任何包含真实密钥的文件。
- 业务表结构通过 `supabase/migrations` 下的 SQL migration 管理。

AI 配置说明：

- `AI_DEFAULT_PROVIDER` 可设置为 `qwen` 或 `doubao`。
- `QWEN_API_KEY`、`DOUBAO_API_KEY` 只在后端读取，不能暴露到前端。
- `QWEN_BASE_URL`、`DOUBAO_BASE_URL` 使用兼容 OpenAI Chat Completions 的接口地址，可填写 API 根地址或完整 `/chat/completions` 地址。
- `QWEN_MODEL`、`DOUBAO_MODEL` 填写对应供应商的模型名称。

## 数据库初始化

Supabase migration 文件位于 `supabase/migrations`，当前包含：

```text
supabase/migrations/20260524093000_create_pod_core_tables.sql
supabase/migrations/20260524094500_create_assets_storage_bucket.sql
supabase/migrations/20260524101600_make_ai_generations_product_draft_nullable.sql
supabase/migrations/20260524113000_create_export_records.sql
supabase/migrations/20260527091000_allow_delete_used_mockup_templates.sql
supabase/migrations/20260527103000_create_image_derivatives.sql
supabase/migrations/20260528123000_archive_mockup_templates.sql
```

这些 migration 会创建 POD 系统第一版需要的基础表：

- `assets`
- `image_jobs`
- `image_job_items`
- `mockup_templates`
- `mockup_outputs`
- `product_drafts`
- `ai_generations`
- `export_records`
- `image_derivatives`

同时会创建 Supabase Storage bucket：

- `assets`

所有业务表已启用 RLS，并包含基础策略：允许已登录用户访问。上传接口通过后端 service role 写入 Storage 和 `assets` 表，前端不会接触 `SUPABASE_SERVICE_ROLE_KEY`。

如果使用 Supabase CLI，本地初始化可执行：

```bash
supabase start
supabase db reset
```

推送到已关联的 Supabase 项目：

```bash
supabase link --project-ref your-project-ref
supabase db push
```

## 图片批量上传

上传页面：

```text
/upload
```

当前支持：

- 一次选择多张图片
- `jpg`、`jpeg`、`png`、`webp`
- 上传原图到 Supabase Storage 的 `assets` bucket
- 上传成功后写入 `assets` 表
- 展示每张图片的上传成功或失败原因
- 上传成功后可跳转到素材库页面

使用前需要确保：

1. `.env.local` 已配置 Supabase 环境变量。
2. Supabase migration 已执行，`assets` 表和 `assets` Storage bucket 已创建。

## 素材库

素材库页面：

```text
/assets
```

当前支持：

- 从 `assets` 表读取图片素材
- 卡片形式展示缩略图、文件名、尺寸、格式、状态、版权状态和创建时间
- 按状态筛选：`uploaded`、`processing`、`processed`、`failed`
- 按版权状态筛选：`unknown`、`owned`、`commercial_ok`、`risky`、`forbidden`
- 多选图片
- 刷新列表
- 打开图片详情弹窗，查看原图大图和基础信息
- 删除单个素材
- 批量删除素材

删除说明：
- 删除前会先检查素材是否被图片任务、套图结果或商品草稿引用。
- 未被使用的素材会弹出普通确认框。
- 已被使用的素材会弹出确认文案：“该素材已被使用，删除可能影响商品草稿，是否继续？”
- 用户确认后，会删除相关商品草稿、套图结果、任务子项，再删除 `assets` 表记录，并尝试删除 Supabase Storage 中的原图和处理后图片。
- 只会删除该素材对应的 Storage 文件，不会删除无关文件。

当前暂不支持编辑素材和 AI 生成。

## 批量改尺寸

入口：

```text
/assets
```

在素材库选择多张图片后，点击“批量改尺寸”创建处理任务。当前支持两个预设：

- T恤印花：4500 x 5400 PNG，透明背景，居中
- 方形商品图：2000 x 2000 JPG，白色背景，居中

处理流程：

1. 创建 `image_jobs` 任务记录。
2. 为每张图片创建 `image_job_items` 子任务记录。
3. 后端使用 Sharp 同步处理图片尺寸。
4. 处理结果上传到 Supabase Storage 的 `assets` bucket。
5. 更新 `assets.processed_url` 和任务成功、失败统计。
6. 失败图片会在 `image_job_items.error_message` 记录失败原因。

当前不做抠图、高清化和套图。任务执行代码已拆分到 `src/lib/image-processing`，后续可替换为队列消费。

## 图片任务中心

任务中心页面：

```text
/image-jobs
```

当前支持：

- 展示 `image_jobs` 列表
- 显示任务ID、任务类型、状态、总数、成功数、失败数和创建时间
- 点击任务查看 `image_job_items` 明细
- 明细展示原图、处理结果图、状态和失败原因
- 刷新任务状态和当前任务明细
- 只查看失败项
- 重新执行失败项：对 resize 和 mockup 任务，可单项或批量重跑失败的 `image_job_items`
- 重试会沿用原 `image_jobs.options`，成功后更新原子任务的 `output_url` 和 `status`，失败后更新 `error_message`
- 重试完成后会重新计算原任务的 `success_count` 和 `failed_count`

当前不支持删除任务和队列系统；cutout、enhance 类型仍是预留任务类型，暂不支持重试执行。

## 印花提取与一键抠图

印花提取页面：

```text
/print-extraction
```

一键抠图页面：

```text
/cutout
```

当前已完成本地图像处理 MVP：

- 页面可选择多张素材，设置处理模式和基础参数，批量创建处理任务。
- 一键抠图支持自动背景、白底、黑底、纯色背景、边缘泛洪移除和主体抠图。
- 印花提取支持自动、浅色衣服、深色衣服、高对比图案、彩色卡通图案、3D/主体图案和手动框选区域模式。
- 后端使用 `sharp` 和 TypeScript 像素算法，不调用外部图像 API。
- 生成的透明 PNG、白底预览图和 mask 图会上传到 Supabase Storage 的 `assets` bucket。
- 处理结果写入 `image_derivatives`，同时更新 `assets.print_extract_url`、`assets.cutout_url` 和 `assets.preferred_design_url`。
- 当前接口同步批量处理，单张失败不会影响其他图片，失败项会在接口结果中返回明确原因和建议。
- `/api/image-derivatives/[derivativeId]/set-preferred` 可将某个处理结果设置为套图优先使用的设计图。

当前不使用 remove.bg、Replicate、OpenAI、豆包、千问、OpenCV 或 ONNX。复杂背景、低对比印花和衣服褶皱场景仍可能需要调整参数或手动框选。

## 套图模板

套图模板页面：

```text
/mockup-templates
```

当前支持：

- 创建套图模板
- 填写模板名称、产品类型和 `scenes` JSON
- 上传场景底图到 Supabase Storage
- 将上传后的底图插入为场景配置
- 查看模板详情和场景配置
- 归档套图模板；归档后默认列表不显示，但可切换到已归档模板并恢复
- 归档模板不会删除 Supabase Storage 中的底图，也不会删除历史 `mockup_outputs`
- 上传一张测试印花生成预览图

`scenes` JSON 示例：

```json
[
  {
    "name": "主图",
    "background_url": "xxx",
    "need_print": true,
    "print_area": {
      "x": 400,
      "y": 300,
      "width": 500,
      "height": 600
    },
    "output_width": 2000,
    "output_height": 2000,
    "fit": "contain",
    "anchor": "center",
    "offset_x": 0,
    "offset_y": 0,
    "scale": 1,
    "rotation": 0
  },
  {
    "name": "尺码图",
    "background_url": "xxx",
    "need_print": false,
    "output_width": 2000,
    "output_height": 2000
  }
]
```

预览生成规则：

- `need_print = true` 时，将测试印花按 `print_area` 放到底图上。
- `need_print = false` 时，直接输出固定底图。
- `print_area` 坐标基于 `output_width / output_height`，预览和批量生成共用同一套放置计算。
- `fit` 默认 `contain`，`anchor` 默认 `center`，旧模板未填写这些字段时会自动使用默认值。
- 当前使用 Sharp 合成图片，不做复杂透视变形，也不做拖拽编辑器。

## 批量商品套图

套图任务页面：

```text
/mockup-jobs
```

当前支持：

- 选择多张素材图片
- 选择一个 `mockup_template`
- 点击“生成套图”后创建 `image_jobs`，`job_type = mockup`
- 每张素材创建一条 `image_job_items`
- 使用 Sharp 按模板 scenes 批量合成商品图
- 生成时优先使用 `assets.preferred_design_url`，其次使用 `print_extract_url`、`cutout_url`、`processed_url`，最后使用 `original_url`
- 每张素材生成一组商品图并保存到 `mockup_outputs`
- `mockup_outputs.output_images` 使用 JSON 数组保存图片 URL 列表
- 失败时记录 `image_job_items.error_message` 和 `mockup_outputs.error_message`
- 生成完成后在页面查看每个商品的套图结果
- 可下载单组套图 ZIP，图片按 `01-main.jpg`、`02-gallery.jpg`、`03-detail.jpg` 顺序命名

当前不做 AI，也不做批量导出。

## AI 生成上架信息

AI 生成页面：

```text
/ai-generate
```

后端接口：

```text
/api/ai/generate-listing
```

输入字段：

- `provider`：`qwen` 或 `doubao`
- `product_type`
- `theme`
- `style`
- `target_platform`
- `image_description`
- `product_draft_id`：可选，选择后会同步更新商品草稿

AI 输出会被校验为严格 JSON：

```json
{
  "title": "",
  "description": "",
  "tags": [],
  "bullet_points": [],
  "seo_keywords": [],
  "sku_prefix": ""
}
```

处理规则：

- API Key 只从服务端环境变量读取，前端不会暴露密钥。
- 生成内容要求英文，适合跨境 POD 商品。
- 提示词禁止侵权品牌词，并明确禁止 Disney、Nike、Marvel、Hello Kitty 等品牌词。
- AI 返回非 JSON 时，会尝试提取或修复为 JSON；仍失败则返回错误。
- 成功和失败记录都会写入 `ai_generations` 表。
- 如果选择了商品草稿，会同步更新 `product_drafts.title`、`description`、`tags`、`bullet_points`、`sku` 和 `product_type`。

## 商品草稿

商品草稿页面：

```text
/products
```

当前支持：

- 展示 `product_drafts` 列表
- 显示商品主图、标题、SKU、产品类型、价格、状态和创建时间
- 从素材图片创建商品草稿
- 从 `mockup_outputs` 创建商品草稿，并自动带入套图图片
- 编辑 `title`、`description`、`tags`、`bullet_points`、`sku`、`price`、`product_type`、`status`
- 查看商品图片
- 保存修改
- 将状态标记为 `ready`
- 搜索商品草稿：支持按标题、SKU、产品类型、状态和 ID 搜索
- 下载单个商品套图 ZIP：在商品详情中打包下载当前商品的全部图片，ZIP 文件名使用 SKU，图片按 `01-main.jpg`、`02-gallery.jpg`、`03-detail.jpg` 顺序命名

当前不做真正上架、SDS 推送和多平台发布。

## 导出中心

导出页面：

```text
/exports
```

当前支持：

- 选择多个 `product_drafts` 商品草稿。
- 只导出 `status = draft` 或 `status = ready` 的商品。
- 使用 `exceljs` 生成商品 Excel。
- Excel 字段包括 SKU、Title、Description、Tags、Bullet Points、Product Type、Price、Main Image、Gallery Images。
- 使用 `jszip` 生成图片 ZIP。
- ZIP 内按 SKU 创建文件夹，每个商品文件夹包含该商品的所有套图图片。
- 导出完成后在页面显示 Excel 或 ZIP 下载链接。
- 导出失败时在页面显示失败原因。
- 导出成功或失败都会写入 `export_records`，导出中心展示最近 30 条记录。

导出文件会上传到 Supabase Storage 的 `assets` bucket：

```text
exports/{yyyy-mm-dd}/{uuid}.xlsx
exports/{yyyy-mm-dd}/{uuid}.zip
```

下载链接会写入 `export_records.download_url`。Vercel 线上环境不会写入 `public` 目录。

当前不做 SDS 自动推送和多平台自动上架。

## 检查与构建

```bash
npm run lint
npm run build
```

## 开发规范

后续 AI 或开发者修改本项目时，必须先阅读并遵守根目录的 `AGENTS.md`。

核心要求：

- 每次只完成用户指定任务，不自行扩展大功能。
- API Key 必须使用环境变量，不能写死在代码里，也不能提交 `.env` 文件。
- 前端不能暴露豆包、千问、SDS 等第三方服务的 API Key。
- 所有 AI 调用必须走后端接口。
- 所有批量任务必须记录成功数、失败数和失败原因。
- 图片处理结果必须保留原图记录。
- 每次改动后必须运行 `npm run lint` 和 `npm run build`。
- 新增功能必须同步更新 README。
- 不确定业务逻辑时先询问，不自行猜测。
