# 印花图提取与一键抠图方案

本文档只描述方案设计，不包含代码实现。

## 一、功能目标

新增“印花图提取”和“一键抠图”能力，用于把 POD 商品图中的设计图案提取为可复用素材，并支持批量处理。

目标能力：

1. 从商品图中提取印花图，例如从 T 恤、卫衣、托特包商品图里提取胸前或背后的图案。
2. 输出透明底 PNG，方便直接进入套图流程。
3. 支持批量选择素材并创建处理任务。
4. 支持粗提取图和最终清理图：
   - 粗提取图用于快速查看算法初步识别结果。
   - 最终清理图用于素材库、套图任务和商品草稿。
5. 支持一键抠图，处理白底、黑底、纯色背景、边缘背景等常见图片。
6. 处理结果可在素材库查看，并能区分原图、粗提取图、最终印花图、抠图结果、预览图。
7. 套图任务优先使用最终印花图，提升固定套图的自动化质量。

第一版不使用外部 API，不接商业 AI 抠图服务。算法优先基于 Sharp、像素缓冲区和本地规则实现。

## 二、页面设计

新增页面：

```text
/print-extraction
/cutout
```

### `/print-extraction` 印花提取

页面用途：从商品图中提取印花区域，生成透明底印花 PNG。

页面模块：

1. 选择素材
   - 从 `assets` 表选择一张或多张素材。
   - 支持按状态、格式、创建时间筛选。
   - 显示缩略图、文件名、尺寸、状态。
2. 处理模式
   - `auto`
   - `light_garment`
   - `dark_garment`
   - `high_contrast`
   - `manual_rect`
3. 参数设置
   - 输出最大宽度。
   - 输出最大高度。
   - 背景/衣服容差。
   - 最小连通区域面积。
   - 边缘羽化半径。
   - 是否裁剪到印花边界框。
   - `manual_rect` 模式下填写或框选 `x/y/width/height`。
4. 预览结果
   - 显示原图。
   - 显示候选 mask。
   - 显示粗提取透明图。
   - 显示白底预览图。
5. 批量创建任务
   - 多选素材后创建 `image_jobs`。
   - `job_type` 可使用现有预留类型 `cutout`，或后续扩展为 `print_extract`。
   - 每张图创建一条 `image_job_items`。
6. 任务结果列表
   - 展示当前任务的每个子项。
   - 显示成功、失败、失败原因、输出图。
7. 下载结果
   - 单张下载最终 PNG。
   - 批量下载 ZIP 可后续复用现有 ZIP 逻辑。
8. 将结果用于套图
   - 支持把某个最终提取结果设置为该素材的优先设计图。
   - 设置后写入 `assets.preferred_design_url` 或通过 `image_derivatives` 标记。

### `/cutout` 一键抠图

页面用途：移除图片背景，生成透明底 PNG。

页面模块：

1. 选择素材
   - 从素材库选择一张或多张图片。
2. 处理模式
   - `auto_background`
   - `white_background`
   - `black_background`
   - `solid_background`
   - `edge_flood_fill`
3. 参数设置
   - 背景颜色容差。
   - 边缘采样宽度。
   - 羽化半径。
   - 是否保留阴影。
   - 是否裁剪透明边界。
4. 预览结果
   - 原图。
   - 透明底结果。
   - 白底预览。
   - mask 预览。
5. 批量创建任务
   - 创建 `image_jobs` 和 `image_job_items`。
6. 任务结果列表
   - 显示每张图的处理状态、结果图、失败原因。
7. 下载结果
   - 下载透明 PNG。
8. 将结果用于套图
   - 支持设置为 `cutout_url` 或 `preferred_design_url`。

## 三、处理模式设计

### 印花提取模式

1. `auto` 自动模式
   - 自动估算衣服主色和背景色。
   - 根据颜色差异、饱和度、边缘密度生成候选印花 mask。
   - 适合普通 T 恤商品图。

2. `light_garment` 浅色衣服提取模式
   - 假设衣服主体偏白、浅灰、浅米色。
   - 优先提取比衣服更深、更饱和或边缘更明显的区域。
   - 适合白色 T 恤上的黑色、彩色印花。

3. `dark_garment` 深色衣服提取模式
   - 假设衣服主体偏黑、深灰、深蓝。
   - 优先提取比衣服更亮、更饱和或颜色差更大的区域。
   - 适合黑色 T 恤上的白色、浅色、彩色图案。

4. `high_contrast` 高对比图案模式
   - 强化边缘和亮度差。
   - 适合商品图中印花与衣服颜色差异明显的图片。
   - 更容易保留文字、线条和色块。

5. `manual_rect` 手动框选印花区域模式
   - 用户手动给出印花区域的 `x/y/width/height`。
   - 算法只在该区域内做提取。
   - 适合低对比、复杂衣服褶皱、背景干扰大的图片。

### 抠图模式

1. `auto_background` 自动背景移除
   - 从图片边缘采样估算背景色。
   - 使用颜色距离和边缘连通性移除背景。

2. `white_background` 去白底
   - 专门处理白底、浅灰底商品图。
   - 根据亮度和饱和度判断接近白色的背景。

3. `black_background` 去黑底
   - 专门处理黑底、深色背景商品图。
   - 根据低亮度区域和边缘连通性移除背景。

4. `solid_background` 去纯色背景
   - 从四边和四角估算单一背景主色。
   - 适合蓝底、绿底、灰底等纯色图。

5. `edge_flood_fill` 边缘背景泛洪移除
   - 从图片四边开始做颜色容差泛洪。
   - 只移除与边缘连通的背景区域，避免误删主体内部相近颜色。

## 四、算法设计

不使用外部 API。第一版优先使用 Sharp 完成图片读取、缩放、raw pixel buffer 获取、PNG/JPG 输出。

建议模块拆分：

1. 下载图片 buffer
   - 输入 `original_url`、`processed_url` 或 `preferred_design_url`。
   - 服务端下载为 `Buffer`。
   - 校验文件大小、content type、最大像素数量。

2. 读取图片像素
   - 使用 Sharp 统一旋转方向。
   - 将大图缩放到算法工作尺寸，例如最长边 1600 或 2000。
   - 输出 raw RGBA 或 RGB buffer。

3. 颜色空间转换 RGB/HSV
   - RGB 用于颜色距离。
   - HSV 用于判断饱和度、亮度、颜色相近程度。

4. 估算背景色
   - 从四角和边缘采样。
   - 使用聚类或简单直方图估算主背景色。
   - 对纯色背景抠图非常关键。

5. 估算衣服主色
   - 从图片中央大区域或手动区域外采样。
   - 对 `light_garment`、`dark_garment` 模式分别设定不同权重。
   - 避免把衣服大面积纹理误认为印花。

6. 根据颜色距离生成 mask
   - 计算像素到背景色、衣服主色的距离。
   - 距离超过阈值的像素进入候选区域。
   - 可使用 RGB 欧氏距离、HSV hue/saturation/value 差异。

7. 根据饱和度、亮度、边缘生成候选印花 mask
   - 高饱和区域更可能是印花。
   - 深色衣服上高亮区域更可能是印花。
   - 浅色衣服上深色区域更可能是印花。
   - 使用相邻像素梯度估算边缘强度。

8. 连通区域分析
   - 对候选 mask 做 connected components。
   - 保留面积较大、位置合理、边界密集的区域。
   - 可优先保留靠近图片中心或手动框选区域内的组件。

9. 去除小噪点
   - 删除面积低于阈值的小连通区域。
   - 删除细碎孤立点。

10. 膨胀/腐蚀/闭运算
    - 腐蚀去掉毛边。
    - 膨胀补回边缘。
    - 闭运算填补图案内部小孔。

11. feather 边缘羽化
    - 对 mask 边缘做轻微 blur。
    - 输出更自然的透明边缘。
    - 参数建议默认 1 到 2 像素。

12. 根据 mask 裁剪边界框
    - 计算非透明区域 bbox。
    - 按 bbox 裁剪输出图。
    - 可加 padding，避免贴边。

13. 输出透明 PNG
    - 原图 RGB + mask alpha 合成 RGBA。
    - 输出透明底 PNG。
    - 保存粗提取图、最终清理图或抠图结果。

14. 生成白底预览图
    - 将透明 PNG 合成到白色背景。
    - 输出 JPG，方便素材库快速展示。

建议第一版采用同步处理，沿用现有任务结构；后续批量规模增大时再接队列或 worker。

## 五、数据库设计

建议新增表：`image_derivatives`。

字段设计：

| 字段 | 类型建议 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `asset_id` | uuid | 关联 `assets.id` |
| `job_item_id` | uuid | 关联 `image_job_items.id`，可为空 |
| `derivative_type` | text | `print_extract_raw`、`print_extract_final`、`cutout`、`mask`、`preview` |
| `source_url` | text | 输入图 URL |
| `output_url` | text | 输出文件 URL |
| `preview_url` | text | 白底预览图 URL |
| `mask_url` | text | mask 图 URL |
| `width` | integer | 输出宽度 |
| `height` | integer | 输出高度 |
| `bbox` | jsonb | 裁剪边界框，例如 `{ "x": 10, "y": 20, "width": 800, "height": 900 }` |
| `options` | jsonb | 本次处理参数 |
| `metrics` | jsonb | 算法指标，例如面积、置信度、组件数量 |
| `status` | text | `pending`、`processing`、`completed`、`failed` |
| `error_message` | text | 失败原因 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

建议索引：

- `image_derivatives_asset_id_idx`
- `image_derivatives_job_item_id_idx`
- `image_derivatives_type_idx`
- `image_derivatives_status_idx`
- `image_derivatives_created_at_idx`

建议给 `assets` 表新增字段：

| 字段 | 是否建议 | 说明 |
| --- | --- | --- |
| `print_extract_url` | 建议新增 | 当前素材的最终印花提取图 |
| `cutout_url` | 建议新增 | 当前素材的一键抠图结果 |
| `preferred_design_url` | 强烈建议新增 | 套图任务优先使用的设计图 URL |

原因：

- `image_derivatives` 保存完整历史结果。
- `assets.print_extract_url` 和 `assets.cutout_url` 方便素材库快速展示。
- `assets.preferred_design_url` 作为业务优先入口，避免套图任务每次查询派生表和判断多个结果。

## 六、Storage 路径设计

所有生成文件继续上传到 Supabase Storage 的 `assets` bucket。

路径建议：

```text
derivatives/{yyyy-mm-dd}/{uuid}-raw.png
derivatives/{yyyy-mm-dd}/{uuid}-final.png
derivatives/{yyyy-mm-dd}/{uuid}-cutout.png
derivatives/{yyyy-mm-dd}/{uuid}-preview.jpg
derivatives/{yyyy-mm-dd}/{uuid}-mask.png
```

文件用途：

- `raw.png`：印花粗提取透明 PNG。
- `final.png`：最终清理透明 PNG。
- `cutout.png`：一键抠图透明 PNG。
- `preview.jpg`：白底预览图。
- `mask.png`：黑白或灰度 mask 图。

命名规则：

- 使用服务端生成的 UUID。
- 不使用原始文件名作为主文件名，避免中文、空格和重复名问题。
- 可在 `image_derivatives.options` 或 `metrics` 中记录原始文件名。

## 七、API 设计

### `POST /api/print-extraction/jobs`

用途：创建印花提取任务。

输入：

```json
{
  "asset_ids": ["uuid"],
  "mode": "auto",
  "options": {
    "max_work_size": 1600,
    "color_tolerance": 42,
    "min_component_area": 300,
    "feather_radius": 1.5,
    "crop_to_bbox": true,
    "manual_rect": {
      "x": 100,
      "y": 200,
      "width": 800,
      "height": 900
    }
  }
}
```

输出：

```json
{
  "job_id": "uuid",
  "status": "completed",
  "total_count": 5,
  "success_count": 4,
  "failed_count": 1
}
```

处理逻辑：

1. 创建 `image_jobs`。
2. 每张素材创建 `image_job_items`。
3. 同步处理每张图片。
4. 生成 `image_derivatives` 记录。
5. 更新 `assets.print_extract_url` 和必要时的 `assets.preferred_design_url`。
6. 更新任务成功数、失败数和失败原因。

### `GET /api/print-extraction/jobs/[jobId]`

用途：查询印花提取任务详情。

返回：

- `image_jobs` 基础信息。
- `image_job_items` 明细。
- 每个子项关联的 `image_derivatives`。

### `POST /api/cutout/jobs`

用途：创建一键抠图任务。

输入：

```json
{
  "asset_ids": ["uuid"],
  "mode": "auto_background",
  "options": {
    "background_tolerance": 35,
    "edge_sample_size": 12,
    "feather_radius": 1.5,
    "keep_shadow": false,
    "crop_to_bbox": true
  }
}
```

处理逻辑：

1. 创建 `image_jobs`。
2. 每张素材创建 `image_job_items`。
3. 输出透明 PNG、mask、白底预览。
4. 写入 `image_derivatives`。
5. 更新 `assets.cutout_url`。
6. 如果用户选择“设为优先设计图”，同步更新 `assets.preferred_design_url`。

### `GET /api/cutout/jobs/[jobId]`

用途：查询一键抠图任务详情。

返回：

- 任务状态。
- 子任务状态。
- 输出图 URL。
- mask URL。
- 预览图 URL。
- 失败原因。

### `POST /api/image-derivatives/[id]/set-preferred`

用途：将某个派生图设置为素材的优先设计图。

输入：

```json
{
  "asset_id": "uuid"
}
```

处理逻辑：

1. 查询 `image_derivatives`。
2. 校验 `asset_id` 是否一致。
3. 将 `assets.preferred_design_url` 更新为该派生图的 `output_url`。
4. 返回更新后的素材记录。

## 八、和现有功能集成

### 素材库

素材库卡片新增展示：

1. 原图。
2. 印花提取结果。
3. 抠图结果。
4. 优先设计图标识。

素材详情弹窗新增：

- `print_extract_url`
- `cutout_url`
- `preferred_design_url`
- 关联的 `image_derivatives` 列表。
- 设置某个结果为优先设计图。

### 套图任务

套图任务选择输入图时使用以下优先级：

1. `preferred_design_url`
2. `cutout_url`
3. `processed_url`
4. `original_url`

如果新增 `print_extract_url`，建议把它写入 `preferred_design_url`，或者在优先级中放到 `cutout_url` 前：

1. `preferred_design_url`
2. `print_extract_url`
3. `cutout_url`
4. `processed_url`
5. `original_url`

为满足本阶段要求，套图任务优先使用：

1. `preferred_design_url`
2. `cutout_url`
3. `processed_url`
4. `original_url`

### 图片任务中心

图片任务中心可复用现有 `image_jobs` 和 `image_job_items`：

- 印花提取任务：建议 `job_type = print_extract`，如果暂时不改枚举，可先使用 `cutout` 并在 `options.mode` 中区分。
- 一键抠图任务：`job_type = cutout`。

建议后续 migration 将 `image_jobs.job_type` 扩展为：

```text
resize, cutout, enhance, mockup, print_extract
```

### 商品草稿与导出

商品草稿不需要直接改结构。只要套图任务使用优先设计图，后续商品草稿和导出中心会自然使用提取后的套图结果。

## 九、验收标准

### 图片输入与任务创建

1. 上传一张 T 恤商品图。
   - 操作：进入 `/upload` 上传图片，再进入 `/print-extraction` 选择该素材。
   - 预期：素材可被选择，显示缩略图、文件名、尺寸。

2. 批量选择 5 张图创建印花提取任务。
   - 操作：选择 5 张素材，模式选择 `auto`，点击创建任务。
   - 预期：生成 1 条 `image_jobs`，生成 5 条 `image_job_items`。

3. 批量选择 5 张图创建抠图任务。
   - 操作：进入 `/cutout`，选择 5 张素材，模式选择 `auto_background`。
   - 预期：任务记录和子任务记录完整，成功数和失败数正确。

### 印花提取

4. 上传一张 T 恤商品图，可以提取胸前或背后印花。
   - 预期：输出透明 PNG，非印花区域大部分透明，印花主体保留。

5. 深色衣服上浅色图案可以提取。
   - 操作：使用 `dark_garment` 模式。
   - 预期：浅色图案被保留，深色衣服主体被透明化。

6. 浅色衣服上深色图案可以提取。
   - 操作：使用 `light_garment` 模式。
   - 预期：深色图案被保留，浅色衣服主体被透明化。

7. 低对比图片可以使用手动框选模式。
   - 操作：使用 `manual_rect`，输入印花区域。
   - 预期：算法只处理框选区域，减少误识别。

### 一键抠图

8. 纯色背景图可以抠图。
   - 操作：进入 `/cutout`，选择 `solid_background`。
   - 预期：纯色背景透明，主体保留。

9. 白底图可以去白底。
   - 操作：选择 `white_background`。
   - 预期：白色背景透明，图案主体保留。

10. 黑底图可以去黑底。
    - 操作：选择 `black_background`。
    - 预期：黑色背景透明，亮色主体保留。

### 结果保存

11. 结果保存到 Supabase Storage。
    - 预期：`assets` bucket 下出现 `derivatives/{yyyy-mm-dd}/...` 文件。

12. `image_derivatives` 写入完整记录。
    - 预期：包含 `asset_id`、`job_item_id`、`derivative_type`、`output_url`、`preview_url`、`mask_url`、`bbox`、`options`、`metrics`、`status`。

13. 失败项有明确错误原因。
    - 操作：上传损坏图片或不支持格式。
    - 预期：`image_job_items.status = failed`，`error_message` 有可读原因。

### 素材库与套图

14. 结果在素材库可见。
    - 预期：素材卡片或详情里能看到印花提取结果和抠图结果。

15. 可以设置优先设计图。
    - 操作：在素材详情中把某个提取结果设为优先设计图。
    - 预期：`assets.preferred_design_url` 被更新。

16. 套图任务可以使用提取后的最终图片。
    - 操作：对已设置优先设计图的素材创建套图任务。
    - 预期：套图使用 `preferred_design_url`，而不是原始商品图。

17. 如果没有 `preferred_design_url`，套图任务按规则降级。
    - 预期：依次使用 `cutout_url`、`processed_url`、`original_url`。

## 十、风险说明

纯本地算法与商业 AI 抠图服务存在差距，第一版需要明确预期。

1. 复杂褶皱衣服可能不完美。
   - 褶皱会产生阴影、亮斑和边缘，容易被误判为印花。
   - 对策：提供 `manual_rect`、容差参数、最小区域过滤。

2. 低对比印花可能需要手动框选。
   - 同色系印花与衣服颜色接近时，规则算法难以稳定区分。
   - 对策：提供 `manual_rect` 和高对比模式，后续可接本地模型。

3. 复杂背景可能需要调参数。
   - 商品图如果不是干净背景，边缘泛洪和颜色距离可能误删或漏删。
   - 对策：提供背景模式选择、背景容差、边缘采样参数。

4. 透明、半透明、渐变图案处理难度较高。
   - 简单 mask 可能损失半透明细节。
   - 对策：保留 raw mask 和 final mask，允许后续调参重跑。

5. 细线条、文字边缘可能出现锯齿。
   - 对策：使用 feather、形态学闭运算和高分辨率工作尺寸。

6. 批量处理可能受到 Vercel Function 时间限制。
   - 第一版同步处理适合小批量验证。
   - 后续需要队列、后台 worker 或分批处理。

7. 后续可以升级为本地 ONNX 模型。
   - 可考虑 U2Net、MODNet、Segment Anything 轻量化方案。
   - 本阶段先不做模型推理，避免引入部署复杂度和算力问题。

## 实施顺序建议

1. 新增数据库 migration：`image_derivatives`，以及 `assets` 的 `print_extract_url`、`cutout_url`、`preferred_design_url`。
2. 新增 Storage 路径工具：统一生成 `derivatives/{yyyy-mm-dd}/{uuid}` 文件路径。
3. 新增算法基础模块：下载、读取像素、颜色转换、mask、形态学、输出 PNG。
4. 新增 `/api/cutout/jobs`，先实现纯色/白底/黑底抠图。
5. 新增 `/api/print-extraction/jobs`，先实现 `auto` 和 `manual_rect`。
6. 新增页面 `/cutout` 和 `/print-extraction`。
7. 素材库展示派生结果。
8. 套图任务接入 `preferred_design_url` 优先级。
9. 扩展任务中心展示派生结果。
10. 补充 MVP 验收清单。
