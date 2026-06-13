# POD 数据迁移说明

这个迁移包用于把旧 POD 项目的线上数据迁移到当前 286 仓库对应的 Supabase 项目。

迁移范围：

- `assets` 素材库记录
- `assets` Storage bucket 里的图片和导出文件
- `image_derivatives`、图片任务、套图、商品草稿等业务表
- 侵权检测记录和高风险/白名单参考库
- AI 模型配置的非敏感字段

不会提交到 GitHub：

- Supabase service role key
- 即梦、千问、OpenAI 等 API Key
- 导出的素材包

## 一次性复制迁移

在本机 PowerShell 进入仓库：

```powershell
cd D:\pod-ai-286
```

设置旧项目和新项目的 Supabase 地址与 service role key：

```powershell
$env:SOURCE_SUPABASE_URL="https://旧项目.supabase.co"
$env:SOURCE_SUPABASE_SERVICE_ROLE_KEY="旧项目 service role key"
$env:TARGET_SUPABASE_URL="https://新项目.supabase.co"
$env:TARGET_SUPABASE_SERVICE_ROLE_KEY="新项目 service role key"
```

执行：

```powershell
node tools/migrate-pod-data.mjs copy
```

默认会导出到本地 `.pod-migration/export`，然后上传到新 Supabase。这个目录已加入 `.gitignore`。

## 分步执行

只导出旧项目：

```powershell
node tools/migrate-pod-data.mjs export
```

只导入到新项目：

```powershell
node tools/migrate-pod-data.mjs import
```

## 迁移 API Key

默认不会导出 API Key。模型配置会导出到：

```text
.pod-migration/export/ai_providers.public.json
```

这个文件只包含模型类型、模型 ID、Endpoint、优先级、状态和脱敏提示。

如果确实要在本机迁移真实 Key，可以临时执行：

```powershell
$env:POD_EXPORT_PROVIDER_KEYS="true"
node tools/migrate-pod-data.mjs export
```

真实 Key 会写入：

```text
.pod-migration/export/private/ai_providers.secrets.json
```

这个目录不会提交到 GitHub。确认内容无误后再执行：

```powershell
node tools/migrate-pod-data.mjs import
```

## 常用选项

不复制 Storage 图片，只迁移数据库记录：

```powershell
$env:POD_INCLUDE_STORAGE="false"
node tools/migrate-pod-data.mjs copy
```

指定导出目录：

```powershell
$env:POD_MIGRATION_DIR="D:\pod-migration-export"
node tools/migrate-pod-data.mjs copy
```

指定 Storage bucket：

```powershell
$env:POD_STORAGE_BUCKET="assets"
node tools/migrate-pod-data.mjs copy
```

## 注意

1. 新 Supabase 必须先执行当前仓库里的 migration，确保表结构存在。
2. Storage bucket 默认是 `assets`。
3. 迁移会保留原表 ID，这样素材、派生图、任务、商品草稿之间的关联不会断。
4. 如果目标库已有同 ID 数据，会用 `upsert` 覆盖这些行。
5. 如果没有提供私有 API Key 文件，`ai_providers` 会被跳过，避免写入空 Key。
