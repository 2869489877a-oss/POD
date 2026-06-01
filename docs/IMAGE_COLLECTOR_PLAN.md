# 需求 052802：图片采集模块方案

## 一、功能目标

图片采集模块用于按用户配置从公开网页中采集图片，并把采集结果保存到 Supabase Storage 和 `assets` 表，最终进入现有素材库流程。

第一版目标：

1. 支持用户配置多个网站来源。
2. 每个网站来源可配置：
   - 网站名称
   - 起始页面 URL
   - 文件夹名称
   - 是否启用
3. 支持关键词配置。
4. 支持下载数量限制。
5. 支持主文件夹名称规则：
   ```text
   {yyyyMMdd-HHmmss}-{customName}
   ```
6. 支持保存采集模板。
7. 支持手动运行采集模板。
8. 支持定时自动运行。
9. 支持查看采集历史。
10. 支持把采集到的图片写入 `assets` 表，进入素材库。

Web 版本的重要边界：

1. 不能在用户本地电脑直接创建文件夹。
2. “自定义主文件夹上层目录路径”在 Web 版本中实现为 Supabase Storage 的逻辑路径前缀。
3. 用户需要本地文件夹结构时，可后续通过 ZIP 导出生成同样的目录结构。

## 二、页面设计

新增页面：

```text
/image-collector
```

页面模块：

1. 采集模板列表
   - 展示模板名称、状态、下载数量、自动运行状态、最近运行时间。
   - 支持选择模板查看详情。

2. 新建采集模板
   - 填写模板名称。
   - 填写主文件夹名称。
   - 填写 Storage 逻辑上层路径。
   - 填写下载数量限制。
   - 填写关键词。
   - 添加网站来源。

3. 编辑采集模板
   - 修改模板基础信息。
   - 修改关键词。
   - 修改来源网站。
   - 修改自动运行频率。
   - 启用或停用模板。

4. 网站来源配置
   - 网站名称。
   - 起始页面 URL。
   - 文件夹名称。
   - 是否启用。
   - 高级配置 `options` 预留。

5. 关键词配置
   - 支持输入多个关键词。
   - 第一版可用 textarea，每行一个关键词。
   - 如果 `source.start_url` 包含 `{{keyword}}`，运行时逐个替换关键词生成采集 URL。

6. 下载数量配置
   - 设置模板级最大下载数量 `max_images`。
   - 第一版按模板总数限制。
   - 后续可扩展为每个来源单独限制。

7. 主文件夹名称配置
   - 用户输入自定义名称，例如：
     ```text
     cat-shirts
     ```
   - 系统实际生成：
     ```text
     20260528-153012-cat-shirts
     ```

8. 逻辑上层目录路径配置
   - 用户输入 Storage 前缀，例如：
     ```text
     collections
     ```
   - 最终路径：
     ```text
     collections/20260528-153012-cat-shirts/{sourceFolder}/{uuid}-{safeFilename}.jpg
     ```

9. 自动运行频率配置
   - 是否启用自动运行。
   - cron 表达式。
   - 页面提示 Vercel Cron 需要额外配置。

10. 手动运行按钮
    - 点击后创建一次 manual run。
    - 页面显示运行中、成功数、失败数。

11. 采集历史
    - 展示每次 run 的状态、发现数量、下载数量、失败数量、错误原因。
    - 支持点击查看 run 明细。

12. 采集结果预览
    - 展示已下载图片缩略图。
    - 显示来源页面 URL、原始图片 URL、Storage 路径、写入的 `asset_id`。

## 三、数据库设计

建议新增 4 张表。

### 1. image_collection_templates

用途：保存采集模板。

字段建议：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `name` | text | 模板名称 |
| `main_folder_name` | text | 用户自定义主文件夹名称 |
| `storage_prefix` | text | Supabase Storage 逻辑上层路径 |
| `keywords` | jsonb | 关键词数组 |
| `max_images` | integer | 下载数量限制 |
| `schedule_enabled` | boolean | 是否启用自动运行 |
| `cron_expression` | text | 自动运行频率 |
| `status` | text | `active / paused / archived` |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

### 2. image_collection_sources

用途：保存模板下的网站来源。

字段建议：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `template_id` | uuid | 关联 `image_collection_templates.id` |
| `site_name` | text | 网站名称 |
| `start_url` | text | 起始页面 URL |
| `folder_name` | text | 子文件夹名称 |
| `enabled` | boolean | 是否启用 |
| `options` | jsonb | 来源级配置预留 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

### 3. image_collection_runs

用途：记录每次采集执行。

字段建议：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `template_id` | uuid | 关联模板 |
| `run_type` | text | `manual / scheduled` |
| `root_folder` | text | 本次实际生成的主文件夹 |
| `status` | text | `pending / processing / completed / failed / partial_failed` |
| `total_found` | integer | 发现图片数量 |
| `total_downloaded` | integer | 成功下载数量 |
| `total_failed` | integer | 失败数量 |
| `error_message` | text | 总体错误 |
| `started_at` | timestamptz | 开始时间 |
| `completed_at` | timestamptz | 完成时间 |
| `created_at` | timestamptz | 创建时间 |

### 4. image_collection_items

用途：记录每张图片的采集结果。

字段建议：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `run_id` | uuid | 关联 `image_collection_runs.id` |
| `source_id` | uuid | 关联 `image_collection_sources.id` |
| `asset_id` | uuid | 成功写入 `assets` 后关联 |
| `source_page_url` | text | 来源页面 URL |
| `image_url` | text | 原始图片 URL |
| `storage_path` | text | Storage 保存路径 |
| `filename` | text | 文件名 |
| `status` | text | `pending / downloaded / failed / skipped` |
| `error_message` | text | 失败原因 |
| `width` | integer | 图片宽度 |
| `height` | integer | 图片高度 |
| `file_size` | integer | 文件大小 |
| `created_at` | timestamptz | 创建时间 |

### RLS 建议

所有新增表启用 RLS。

第一版沿用当前项目风格：

1. 允许 authenticated 用户读取。
2. 允许 authenticated 用户写入。
3. 采集运行由服务端 service role 执行。

## 四、Storage 路径设计

所有图片保存到 Supabase Storage 的 `assets` bucket。

路径规则：

```text
collections/{yyyyMMdd-HHmmss}-{mainFolder}/{sourceFolder}/{uuid}-{safeFilename}.jpg
```

示例：

```text
collections/20260528-153012-cat-shirts/etsy/uuid-001.jpg
collections/20260528-153012-cat-shirts/pinterest/uuid-002.jpg
```

字段映射：

1. `collections` 来自 `storage_prefix`。
2. `20260528-153012-cat-shirts` 来自当前时间和 `main_folder_name`。
3. `etsy` / `pinterest` 来自 `image_collection_sources.folder_name`。
4. 文件名使用 `uuid` 避免冲突。
5. 原始文件名只做安全化处理，不保留危险路径字符。

注意：

1. 不写入 `public` 目录。
2. 不写入 Vercel 本地持久目录。
3. 不使用用户电脑本地路径。
4. 如果后续导出 ZIP，ZIP 内可以使用同样的文件夹结构。

## 五、采集引擎设计

第一版不要做复杂浏览器自动化，不使用 Puppeteer / Playwright。

采集流程：

1. 读取模板。
2. 读取启用的网站来源。
3. 根据关键词展开采集 URL。
4. 从用户输入的页面 URL 下载 HTML。
5. 提取页面中的 `img` 标签。
6. 解析绝对图片 URL。
7. 过滤不合规图片。
8. 按 `max_images` 限制下载数量。
9. 下载图片。
10. 读取图片元信息。
11. 上传到 Supabase Storage。
12. 写入 `assets` 表。
13. 写入 `image_collection_items`。
14. 更新 `image_collection_runs` 统计。

### HTML 下载

要求：

1. 只允许 `http / https` URL。
2. 设置合理超时。
3. 限制最大 HTML 响应大小。
4. 响应不是 `text/html` 时标记失败。
5. 不携带用户登录态。
6. 不绕过登录、验证码、反爬或付费墙。

### 图片 URL 提取

第一版可从 HTML 中提取：

1. `<img src="">`
2. `<img data-src="">`
3. `<img srcset="">` 中的候选图片

URL 处理：

1. 使用页面 URL 作为 base 解析相对路径。
2. 去重。
3. 移除 hash。
4. 保留 query，但下载前限制 URL 长度。

### 图片过滤

过滤规则：

1. 跳过 `data:` base64。
2. 跳过 `svg`。
3. 跳过明显小图标、logo、tracking pixel。
4. 跳过非图片 content-type。
5. 跳过文件过小的图片。
6. 跳过下载后宽高过小的图片。
7. 跳过明确禁止下载或无权限的内容。

建议第一版阈值：

1. 最小宽度：`300`
2. 最小高度：`300`
3. 最大文件大小：`25MB`
4. 支持格式：`jpg / jpeg / png / webp`

### assets 表写入

采集成功后写入 `assets`：

| 字段 | 值 |
| --- | --- |
| `original_url` | Supabase Storage public URL |
| `filename` | 下载文件名 |
| `file_size` | 文件大小 |
| `width` | 图片宽度 |
| `height` | 图片高度 |
| `format` | 图片格式 |
| `status` | `uploaded` |
| `source` | 建议先用 `link`，后续可扩展 `collector` |
| `copyright_status` | `unknown` |

版权追踪：

1. `image_collection_items.source_page_url` 保存来源页面。
2. `image_collection_items.image_url` 保存原始图片 URL。
3. 后续如需在素材库显示来源，可考虑给 `assets` 增加 `source_page_url / source_image_url` 字段，但第一版可先通过 collection item 关联追踪。

## 六、关键词功能设计

第一版不接搜索引擎 API。

实现方式：

1. 用户可保存关键词数组。
2. 如果 `source.start_url` 包含：
   ```text
   {{keyword}}
   ```
   则运行时用关键词替换生成多个采集 URL。
3. 示例：
   ```text
   https://example.com/search?q={{keyword}}
   ```
4. 关键词：
   ```text
   cat shirt
   dog hoodie
   ```
5. 展开后的 URL：
   ```text
   https://example.com/search?q=cat%20shirt
   https://example.com/search?q=dog%20hoodie
   ```

如果 `start_url` 不包含 `{{keyword}}`：

1. 直接采集该 URL。
2. 关键词只作为模板信息保存，不参与 URL 生成。

## 七、自动运行设计

第一版优先实现手动运行，自动运行接口和字段先预留。

### 数据保存

模板保存：

1. `schedule_enabled`
2. `cron_expression`

### Cron API

新增接口：

```text
GET /api/image-collector/cron
```

设计逻辑：

1. 扫描 `schedule_enabled = true` 且 `status = active` 的模板。
2. 判断是否到达执行时间。
3. 到达则创建 `scheduled` run。
4. 逐个执行模板。
5. 写入运行历史。

### Vercel Cron

如果部署在 Vercel，可后续通过 `vercel.json` 配置：

```json
{
  "crons": [
    {
      "path": "/api/image-collector/cron",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

安全建议：

1. Cron API 增加服务端密钥校验，例如 `CRON_SECRET`。
2. `CRON_SECRET` 只放环境变量。
3. 不在前端暴露。

第一版可以先完成手动运行，自动运行只保留字段和接口空壳。

## 八、API 设计

建议新增 API：

```text
GET    /api/image-collector/templates
POST   /api/image-collector/templates
GET    /api/image-collector/templates/[templateId]
PATCH  /api/image-collector/templates/[templateId]
DELETE /api/image-collector/templates/[templateId]
POST   /api/image-collector/templates/[templateId]/run
GET    /api/image-collector/runs
GET    /api/image-collector/runs/[runId]
GET    /api/image-collector/cron
```

### GET /api/image-collector/templates

返回模板列表，包含来源数量、最近运行状态。

### POST /api/image-collector/templates

创建模板和来源。

请求体示例：

```json
{
  "name": "Cat shirt sources",
  "main_folder_name": "cat-shirts",
  "storage_prefix": "collections",
  "keywords": ["cat shirt", "cat hoodie"],
  "max_images": 50,
  "schedule_enabled": false,
  "cron_expression": null,
  "sources": [
    {
      "site_name": "Example",
      "start_url": "https://example.com/search?q={{keyword}}",
      "folder_name": "example",
      "enabled": true,
      "options": {}
    }
  ]
}
```

### POST /api/image-collector/templates/[templateId]/run

手动运行模板。

返回：

```json
{
  "run_id": "...",
  "status": "completed",
  "total_found": 20,
  "total_downloaded": 12,
  "total_failed": 8
}
```

### GET /api/image-collector/runs/[runId]

返回 run 明细和 `image_collection_items` 列表。

### GET /api/image-collector/cron

供 Vercel Cron 调用，扫描自动运行模板。

## 九、验收标准

1. 可以创建采集模板。
2. 可以添加多个网站来源。
3. 可以保存关键词。
4. 可以设置下载数量。
5. 可以设置主文件夹名称。
6. 可以设置 Storage 逻辑上层路径。
7. 可以手动运行采集。
8. 运行后 Supabase Storage 出现 `collections` 目录。
9. Storage 路径符合：
   ```text
   collections/{yyyyMMdd-HHmmss}-{mainFolder}/{sourceFolder}/{uuid}-{safeFilename}.jpg
   ```
10. 采集到的图片进入 `assets` 表。
11. 素材库可以看到采集来的图片。
12. `image_collection_runs` 记录成功数和失败数。
13. `image_collection_items` 保存来源页面 URL 和原始图片 URL。
14. 采集失败有明确错误原因。
15. 不采集 base64、小图标、logo、svg。
16. 不写入 `public` 目录。
17. `npm run lint` 通过。
18. `npm run build` 通过。

## 十、禁止事项

1. 不要使用 Puppeteer / Playwright，第一版不要浏览器自动化。
2. 不要写 `public` 目录。
3. 不要写用户本地路径。
4. 不要绕过登录、验证码、反爬或付费墙。
5. 不要采集 base64 小图标、logo、svg。
6. 不要修改印花提取、抠图、套图模板功能。
7. 不要提交 `.env` 或任何密钥。
8. 不要采集明确禁止下载或无权限的内容。
9. 不要把自动运行密钥暴露到前端。

## 十一、实施拆分建议

建议分阶段实现。

### 第一阶段：模板和手动运行

1. 新增数据库表。
2. 新增 `/image-collector` 页面。
3. 新增模板 CRUD API。
4. 新增来源配置。
5. 实现手动运行。
6. 下载公开 HTML 中的图片。
7. 上传到 Supabase Storage。
8. 写入 `assets` 和采集记录。

### 第二阶段：采集历史和结果体验

1. 完善 run 明细页面。
2. 支持结果预览。
3. 支持失败原因筛选。
4. 支持将采集结果批量送入现有批量处理流程。

### 第三阶段：自动运行

1. 增加 Cron API 安全校验。
2. 配置 Vercel Cron。
3. 实现 schedule 到期判断。
4. 保存 scheduled run。

### 第四阶段：合规增强

1. 为模板增加来源合规备注。
2. 为采集结果增加版权状态初始规则。
3. 增加黑名单域名。
4. 增加 robots / terms 提示和人工确认机制。
