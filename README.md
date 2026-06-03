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
- 图片采集模块第一阶段，支持采集模板 CRUD、网站来源配置和手动运行记录
- 素材库列表、筛选、多选和详情弹窗
- 侵权检测模块，支持基于规则的 IP / 品牌 / 名人 / 体育 / Logo 风险筛查、命中原因记录和人工复核
- 素材库批量改尺寸，生成 POD 标准尺寸图片
- 图片任务中心，查看任务列表和子任务明细
- 印花提取和一键抠图 MVP，基于 Sharp + TypeScript 像素算法批量生成透明底结果
- 简单版套图模板，支持 JSON 坐标配置和预览生成
- 批量商品套图，根据模板为多张素材生成商品图
- 商品草稿管理，支持创建、编辑、查看图片和标记 ready
- 导出中心，支持商品 Excel 和图片 ZIP
- 素材删除、失败任务重试、商品搜索、单商品套图下载和导出记录
- 前端页面内容支持设置中的中文 / English 切换
- 暂不接入爬虫、支付、复杂权限和自动上架能力

## 页面路由

- `/dashboard` 仪表盘
- `/assets` 素材库管理
- `/upload` 上传图片
- `/image-collector` 图片采集
- `/image-jobs` 批量图片处理
- `/infringement-check` 侵权检测和人工复核
- `/print-extraction` 印花提取
- `/cutout` 一键抠图
- `/mockup-templates` 固定商品套图
- `/mockup-jobs` 套图任务
- `/products` 商品草稿管理
- `/ai-image` AI 图片工作台
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

## 本地 Rembg / OpenCV 工具箱

本地图片重处理不要压到 Web 服务上跑。当前根目录的 `app.py` 是一个本地 Gradio 工具箱，包含：

- 抠图：基于 rembg，适合主体/衣服抠图。
- 贴印花：把透明 PNG 印花贴到衣服模板上做预览。
- 摘印花：基于 OpenCV 从衣服照片中粗提取印花。

已有虚拟环境时，直接运行：

```powershell
E:\rembg-server\start-rembg-local.ps1
```

或双击：

```text
E:\rembg-server\start-rembg-local.bat
```

启动后默认访问：

```text
http://127.0.0.1:7860
```

本地配置文件：

```text
rembg-local.env
```

首次运行启动脚本会自动从 `rembg-local.env.example` 复制一份。默认配置只监听本机：

```env
REMBG_LOCAL_HOST=127.0.0.1
REMBG_LOCAL_PORT=7860
REMBG_LOCAL_OPEN_BROWSER=true
REMBG_LOCAL_SHARE=false
REMBG_LOCAL_MAX_CONCURRENT=1
REMBG_LOCAL_QUEUE_MAX_SIZE=8
REMBG_LOCAL_MAX_FILE_SIZE=50mb
```

说明：

- `REMBG_LOCAL_HOST=127.0.0.1`：只允许本机访问，避免暴露到局域网或公网。
- `REMBG_LOCAL_MAX_CONCURRENT=1`：一次只处理一张图，避免 rembg/OpenCV 占满 CPU 和内存。
- `REMBG_LOCAL_SHARE=false`：不生成 Gradio 公网分享链接。
- rembg 模型会缓存到项目根目录的 `.u2net/`，该目录不会提交。

如果需要重装本地依赖：

```powershell
E:\rembg-server\venv\Scripts\python.exe -m pip install -r E:\rembg-server\requirements-rembg-local.txt
```

## 本地 Worker 主动拉任务

生产或准生产环境不建议让服务器通过内网穿透直接访问本地电脑。推荐使用本地 worker 主动拉任务：

```text
POD 主系统
  创建 image_jobs / image_job_items
  提供 worker 领取任务和回写结果接口

本地 worker
  轮询待处理任务
  下载原图
  本地 rembg / OpenCV 处理
  上传结果到 POD 主系统
  POD 主系统再写入 Supabase Storage 和数据库
```

### 服务器环境变量

在 POD 主系统环境变量中配置：

```env
LOCAL_IMAGE_WORKER_ENABLED=true
LOCAL_WORKER_SECRET=your-worker-secret
```

说明：

- `LOCAL_IMAGE_WORKER_ENABLED=true` 后，`/api/cutout/jobs` 和 `/api/print-extraction/jobs` 只创建任务，不在服务器同步处理图片。
- `LOCAL_WORKER_SECRET` 用于本地 worker 调用服务器接口认证。不要提交到 Git。

### 本地 worker 配置

复制配置模板：

```powershell
Copy-Item E:\rembg-server\local-worker.env.example E:\rembg-server\local-worker.env
```

编辑 `local-worker.env`：

```env
POD_API_URL=http://127.0.0.1:3000
LOCAL_WORKER_SECRET=your-worker-secret
LOCAL_WORKER_ID=bruce-local-worker
LOCAL_WORKER_JOB_TYPES=cutout,print_extraction
POLL_INTERVAL_SECONDS=5
LOCAL_WORKER_REQUEST_TIMEOUT_SECONDS=120
LOCAL_WORKER_MAX_IMAGE_SIZE_MB=50
LOCAL_REMBG_MODEL=isnet-general-use
LOCAL_PRINT_TOLERANCE=25
```

`LOCAL_WORKER_SECRET` 必须和服务器环境变量保持一致。

启动 worker：

```powershell
E:\rembg-server\start-local-worker.ps1
```

或双击：

```text
E:\rembg-server\start-local-worker.bat
```

worker 会串行处理任务。没有任务时按 `POLL_INTERVAL_SECONDS` 间隔等待。

### Worker 接口

本地 worker 使用以下接口：

```text
POST /api/local-worker/jobs/claim
POST /api/local-worker/jobs/:itemId/complete
POST /api/local-worker/jobs/:itemId/fail
```

这些接口都要求：

```http
Authorization: Bearer <LOCAL_WORKER_SECRET>
```

### 数据库迁移

本地 worker 需要执行迁移：

```text
supabase/migrations/20260601143000_add_local_worker_image_jobs.sql
```

该迁移会让 `image_jobs.job_type` 支持 `print_extraction`，并增加待处理子任务索引。

## 侵权检测模块

新增的 `/infringement-check` 页面用于在素材进入套图、商品草稿和导出前做风险分流。当前版本先落地轻量规则引擎：

- 扫描素材文件名、原图 URL、来源字段，以及该素材关联的商品草稿标题、描述、标签、五点描述、SKU 和产品类型。
- 命中影视动漫游戏 IP、知名品牌、名人、球队赛事、Logo / 商标词和高风险平台文案后，写入 `infringement_checks` 表。
- 自动检测只会把高风险素材同步标记为 `risky` 或 `forbidden`；未命中不会自动改成“可商用”，避免把机器检测当作授权证明。
- 人工复核可以把素材标记为可商用、有风险或禁用，并保存授权依据 / 备注。
- 套图生成、商品创建和导出只放行 `owned` / `commercial_ok` 素材；`unknown`、`risky`、`forbidden` 都会要求先完成复核。

需要执行数据库迁移：

```text
supabase/migrations/20260603100000_create_infringement_checks.sql
```

后续可在该表的 `detection_source = visual_ai` 基础上接入豆包 / 即梦 / 千问视觉模型，补充 OCR、Logo 检测、主体识别、相似图 / pHash 检索等能力。

参考口径：

- USPTO Trademark Basics: https://www.uspto.gov/trademarks/basics
- USPTO Trademark / Patent / Copyright 区分: https://www.uspto.gov/trademarks/basics/trademark-patent-copyright
- U.S. Copyright Office FAQ: https://www.copyright.gov/help/faq/faq-general.html
- Etsy Intellectual Property Policy: https://www.etsy.com/legal/ip/
- Amazon Brand Registry: https://sell.amazon.com/brand-registry/
- Amazon Report a Violation: https://sell.amazon.com/blog/report-a-violation-to-amazon

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
```

使用规则：

- 前端代码只能使用 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- `SUPABASE_SERVICE_ROLE_KEY` 只能在后端代码中使用，当前入口为 `src/lib/supabase/server.ts`。
- 不要提交真实 `.env`、`.env.local` 或任何包含真实密钥的文件。
- 业务表结构通过 `supabase/migrations` 下的 SQL migration 管理。

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
supabase/migrations/20260528170000_create_image_collector.sql
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
- `image_collection_templates`
- `image_collection_sources`
- `image_collection_runs`
- `image_collection_items`

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

当前暂不支持直接编辑素材；AI 图片生成请使用 `/ai-image`。

## 图片采集

图片采集页面：

```text
/image-collector
```

当前支持：

- 创建、编辑和归档采集模板
- 配置多个网站来源：网站名称、起始页面 URL、文件夹名称和启用状态
- 配置关键词、下载数量、主文件夹名称和 Supabase Storage 逻辑上层目录路径
- 保存自动运行开关、运行频率和 `cron_expression`
- 自动运行频率支持：手动、每小时、每天、每周和自定义 5 段 cron
- 手动运行采集模板
- 从公开页面 HTML 中提取 `img`、`data-src`、`data-original` 和 `srcset` 图片
- 按 `max_images` 限制本次下载数量，最多 3 个并发下载
- 采集图片上传到 Supabase Storage 的 `assets` bucket
- 采集成功后写入 `assets` 表，并进入素材库
- 单张图片失败不会影响其他图片，失败原因写入采集明细
- 查看最近采集运行历史
- 通过 Vercel Cron 定时触发 `/api/image-collector/cron`，到期模板会自动运行并更新 `last_run_at`、`next_run_at`

当前只处理公开可访问页面，不使用 Puppeteer、Playwright 或浏览器自动化，不绕过登录、验证码、付费墙或目标网站权限限制。

Web 版本不会写入用户本地文件夹，也不会写入 `public` 目录。采集结果会保存到 Supabase Storage 的 `assets` bucket，路径规则为：

```text
collections/{yyyyMMdd-HHmmss}-{mainFolder}/{sourceFolder}/{uuid}-{safeFilename}.jpg
```

自动运行说明：

- `vercel.json` 已配置每 30 分钟触发一次 `/api/image-collector/cron`。
- 如果配置了环境变量 `CRON_SECRET`，Cron API 会校验请求头 `Authorization: Bearer ${CRON_SECRET}`。
- 如果未配置 `CRON_SECRET`，生产环境会校验 Vercel Cron 的 `user-agent` 是否包含 `vercel-cron/1.0`。
- 本地开发环境允许直接访问 Cron API 方便测试。

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

当前不做 AI 文案，也不做批量导出。

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

## AI Image / Seedream 5.0

The `/ai-image` page supports text-to-image and image-to-image through `/api/ai/generate-image`.

For Volcano Ark Seedream 5.0 providers:

- `base_url` should normally be `https://ark.cn-beijing.volces.com`. The backend also accepts values that already end with `/api/v3` or `/api/v3/images/generations`.
- The image-to-image upload flow must pass the uploaded asset `original_url` as `reference_url`; otherwise Seedream receives no reference image and falls back to text-only generation.
- The image-to-image page provides editable print-extraction prompt templates and no longer exposes a separate negative prompt field.
- The image-to-image print extraction flow can run local transparent-background cleanup after AI generation before saving the result to assets.
- The `Transparent Print` tab changes white/light print backgrounds to transparent PNG in the browser with no external API call.
- The request body is aligned with the official Seedream 5.0 image generation API: `model`, `prompt`, optional `image`, `size`, `response_format: "url"`, `output_format: "png"`, `watermark: false`, and `optimize_prompt_options: { mode: "standard" }`.
- Seedream negative prompt text is folded into `prompt` as an avoid instruction instead of being sent as an unsupported `negative_prompt` field.
- When a reference image is present, the backend enables single-result auto sequence mode with `sequential_image_generation: "auto"` and `sequential_image_generation_options: { max_images: 1 }`.
- Do not send generic diffusion parameters such as `guidance_scale`, `quality`, or `prompt_priority` to Seedream 5.0 unless the official Volcano Ark API for the configured model explicitly supports them.

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
