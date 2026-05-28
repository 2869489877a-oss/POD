# POD 商品图批量处理系统部署文档

本文档用于第一版内部部署：Next.js 部署到 Vercel，数据库和图片存储使用 Supabase，AI 接口通过环境变量配置。

## 1. 部署前准备

确认本地项目可以正常通过检查：

```bash
npm install
npm run lint
npm run build
```

需要准备的账号和权限：

- GitHub 账号：用于托管代码仓库。
- Supabase 账号：用于数据库和 Storage。
- Vercel 账号：用于部署 Next.js 项目。
- qwen 或 doubao 的 API Key：用于 AI 生成上架信息。

部署前确认不要提交这些内容：

- `.env`
- `.env.local`
- 任何真实 API Key
- 手工下载或临时生成的业务导出文件

第一版仅内部使用。当前项目没有复杂团队权限和登录系统，部署后不要把生产地址公开传播；建议在 Vercel 上启用团队访问、部署保护、密码保护或其他内部访问控制。

## 2. GitHub 仓库配置

1. 在 GitHub 创建一个私有仓库。
2. 将当前项目推送到仓库。
3. 确认以下文件已包含在仓库中：
   - `package.json`
   - `package-lock.json`
   - `src`
   - `supabase/migrations`
   - `.env.example`
   - `AGENTS.md`
   - `docs`
4. 确认以下文件没有被提交：
   - `.env`
   - `.env.local`
   - `.next`
   - `node_modules`
   - 手工下载或临时生成的 Excel、ZIP 等业务导出文件

推荐生产分支使用 `main`。后续所有数据库结构变更必须通过 `supabase/migrations` 提交，不要直接在远程数据库手工改表后忘记补 migration。

## 3. Supabase 项目配置

1. 登录 Supabase。
2. 创建新项目。
3. 记录项目信息：
   - Project URL
   - anon public key
   - service_role key
4. 进入 Project Settings，确认 API Keys 可用。
5. service role key 只能配置在 Vercel 环境变量里，不能写入前端代码，不能提交到 GitHub。

当前项目后端会使用 service role 写入数据库和 Storage；前端只能使用 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

## 4. Supabase Storage Bucket 配置

当前 migration 会创建一个 Storage bucket：

```text
assets
```

配置要求：

- bucket 名称：`assets`
- public：`true`
- 用途：保存上传原图、处理后图片、印花提取/抠图结果、套图背景图、套图输出图、导出文件。

如果 migration 没有自动创建 bucket，可以在 Supabase Dashboard 手动检查：

1. 打开 Storage。
2. 确认存在 `assets` bucket。
3. 确认 bucket 是 public。
4. 不要新建其他同名或相似 bucket，避免代码上传路径不一致。

注意：public bucket 中的文件只要拿到 URL 就可以访问，适合第一版内部流程验证；如果后续要处理敏感素材，需要改成 private bucket 和签名 URL。

## 5. 数据库 Migration 执行方法

当前 migration 文件：

```text
supabase/migrations/20260524093000_create_pod_core_tables.sql
supabase/migrations/20260524094500_create_assets_storage_bucket.sql
supabase/migrations/20260524101600_make_ai_generations_product_draft_nullable.sql
supabase/migrations/20260524113000_create_export_records.sql
supabase/migrations/20260527091000_allow_delete_used_mockup_templates.sql
supabase/migrations/20260527103000_create_image_derivatives.sql
supabase/migrations/20260528123000_archive_mockup_templates.sql
```

推荐使用 Supabase CLI 执行：

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

执行后检查这些表是否存在：

- `assets`
- `image_jobs`
- `image_job_items`
- `mockup_templates`
- `mockup_outputs`
- `product_drafts`
- `ai_generations`
- `export_records`
- `image_derivatives`

同时检查：

- 表已启用 RLS。
- `assets` Storage bucket 已创建。
- `assets` bucket 的 public 设置正确。

如果没有安装 Supabase CLI，也可以在 Supabase Dashboard 的 SQL Editor 中按 migration 文件顺序执行 SQL。此方法适合临时部署验证；长期协作仍建议使用 CLI 保持 migration 历史一致。

## 6. Vercel 项目创建方法

1. 登录 Vercel。
2. 点击 Add New Project。
3. 选择 GitHub 仓库。
4. Framework Preset 选择 Next.js。
5. Root Directory 保持项目根目录。
6. Install Command 使用默认或填写：

```bash
npm install
```

7. Build Command：

```bash
npm run build
```

8. Output Directory 保持默认。
9. 在创建项目页面或创建后进入 Settings 配置环境变量。
10. 环境变量配置完成后再触发 Deploy。

部署完成后，Vercel 会生成 Production URL 和 Preview URL。第一版内部使用时，建议只把 Production URL 发给内部使用人员。

## 7. Vercel 环境变量配置

进入 Vercel 项目：

```text
Project Settings -> Environment Variables
```

建议至少配置到 Production 和 Preview 环境。内部测试也可以只先配置 Production，但 Preview 分支如果需要测试，也必须有相同变量。

配置规则：

- `NEXT_PUBLIC_*` 变量可以被前端读取，不要放敏感密钥。
- `SUPABASE_SERVICE_ROLE_KEY`、`QWEN_API_KEY`、`DOUBAO_API_KEY` 只能作为服务端环境变量使用。
- 修改环境变量后，需要重新部署才会生效。
- 不要把 `.env.local` 上传到 Vercel 以外的地方。

## 8. 需要配置的环境变量清单

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

说明：

| 变量 | 是否必须 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase Project URL，前端和后端都会使用。 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase anon public key，只能用于前端安全范围。 |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase service role key，仅后端使用。 |
| `AI_DEFAULT_PROVIDER` | 否 | 默认 AI provider，可填 `qwen` 或 `doubao`。 |
| `QWEN_API_KEY` | 使用 qwen 时必须 | 千问 API Key，仅后端使用。 |
| `QWEN_MODEL` | 使用 qwen 时必须 | 千问模型名称。 |
| `QWEN_BASE_URL` | 使用 qwen 时必须 | 兼容 Chat Completions 的接口地址。 |
| `DOUBAO_API_KEY` | 使用 doubao 时必须 | 豆包 API Key，仅后端使用。 |
| `DOUBAO_MODEL` | 使用 doubao 时必须 | 豆包模型名称。 |
| `DOUBAO_BASE_URL` | 使用 doubao 时必须 | 兼容 Chat Completions 的接口地址。 |

如果暂时不测试 AI，可以先只配置 Supabase 相关变量；访问 `/ai-generate` 时未配置的 provider 会返回错误提示。

## 9. 部署后如何测试

按这个顺序验证，方便定位问题：

1. 打开 Vercel Production URL。
2. 访问 `/dashboard`，确认页面能打开。
3. 访问 `/upload`，上传 1 张 jpg 或 png。
4. 访问 `/assets`，确认刚上传的图片能显示。
5. 在 `/assets` 选择图片，测试批量改尺寸。
6. 访问 `/image-jobs`，确认任务记录、成功数、失败数能显示。
7. 访问 `/mockup-templates`，创建一个简单模板并上传底图。
8. 访问 `/mockup-jobs`，选择素材和模板生成套图。
9. 访问 `/products`，从套图结果创建商品草稿，保存修改并下载单商品套图 ZIP。
10. 访问 `/ai-generate`，用已配置的 provider 测试生成标题、描述和标签。
11. 访问 `/exports`，选择商品草稿测试 Excel 和图片 ZIP 导出。

重点检查：

- 上传后 Storage 是否出现文件。
- `assets` 表是否出现记录。
- 图片 URL 是否能打开。
- Sharp 图片处理是否成功。
- AI 错误是否能显示给用户。
- Excel 是否能下载并正常打开。
- ZIP 是否能下载，内部图片结构是否正确。
- `export_records.download_url` 是否写入 Supabase Storage 的公开 URL。

注意：导出文件应上传到 Supabase Storage 的 `assets` bucket，路径形如 `exports/{yyyy-mm-dd}/{uuid}.xlsx` 或 `exports/{yyyy-mm-dd}/{uuid}.zip`。Vercel serverless 运行环境不能依赖写入 `public` 目录保存导出文件。

## 10. 常见错误和解决方法

### 构建失败：缺少环境变量

现象：

- Vercel build 或页面运行时报 Supabase URL、key 缺失。

处理：

- 检查 Vercel Environment Variables。
- 确认变量配置到了当前部署环境。
- 重新部署项目。

### 上传失败

可能原因：

- `SUPABASE_SERVICE_ROLE_KEY` 未配置或配置错误。
- `assets` bucket 不存在。
- Supabase Project URL 或 anon key 配错。
- 图片过大导致请求超时。

处理：

- 检查 `/api/upload` 的 Vercel Function Logs。
- 在 Supabase Storage 确认 `assets` bucket 存在。
- 重新执行 migration。
- 先用小图验证链路。

### 图片不显示

可能原因：

- `assets` bucket 不是 public。
- Storage URL 不是当前 Supabase 项目生成的 URL。
- 浏览器缓存或图片文件已被删除。

处理：

- 检查 `assets.original_url` 或 `processed_url` 是否能直接打开。
- 确认 Storage bucket public 设置。
- 重新上传一张测试图片。

### 数据库表不存在

可能原因：

- migration 没有执行。
- Vercel 连接到了另一个 Supabase 项目。

处理：

```bash
supabase link --project-ref your-project-ref
supabase db push
```

然后到 Supabase Table Editor 检查表是否存在。

### RLS 或权限错误

可能原因：

- migration 未完整执行。
- service role key 配错成 anon key。

处理：

- 确认业务表已启用 RLS 且策略存在。
- 确认 `SUPABASE_SERVICE_ROLE_KEY` 使用的是 service role key。
- 不要在前端暴露 service role key。

### AI 生成失败

可能原因：

- provider API Key 未配置。
- model 或 base URL 配错。
- provider 返回内容不是 JSON。

处理：

- 检查 Vercel Function Logs。
- 确认 `AI_DEFAULT_PROVIDER` 是 `qwen` 或 `doubao`。
- 确认对应 provider 的 key、model、base URL 已配置。
- 页面会显示 AI 返回非 JSON 或请求失败的错误原因。

### 批量处理或套图任务超时

可能原因：

- 第一版使用同步处理。
- 图片太大或一次选择太多。
- Vercel Function 有执行时间限制。

处理：

- 先用 1 到 3 张图片测试。
- 降低单次处理数量。
- 后续如需要大批量稳定处理，应接入队列或后台 worker。

### Excel 或 ZIP 下载失败

可能原因：

- 当前导出文件写到运行时本地目录，Vercel 环境不保证持久写入。
- 图片 URL 下载失败。
- 商品没有图片。

处理：

- 检查 Vercel Function Logs。
- 先测试单个商品套图 ZIP。
- 确认商品草稿 `images` 字段有图片 URL。
- 后续生产化如需限制导出文件访问权限，建议改为 private bucket 和签名 URL。

### Supabase migration 状态不一致

可能原因：

- 远程数据库被手工改过。
- migration 文件和远程 migration 历史不一致。

处理：

```bash
supabase migration list
```

确认本地和远程状态。如果确实已经手工执行过 SQL，需要谨慎使用 `supabase migration repair` 修正历史；不要在不清楚数据库状态时强行修复。

## 官方参考

- Vercel Next.js 部署文档：https://vercel.com/docs/frameworks/full-stack/nextjs
- Vercel 环境变量文档：https://vercel.com/docs/environment-variables
- Supabase migration 文档：https://supabase.com/docs/guides/deployment/database-migrations
- Supabase Storage bucket 文档：https://supabase.com/docs/guides/storage/buckets/fundamentals
