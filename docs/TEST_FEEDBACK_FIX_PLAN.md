# 测试反馈修复方案

## 1. 检查范围和当前结论

本次只针对测试反馈做修复方案，不实现代码。

已重点检查以下模块：

- `src/lib/image-ai/`
- `src/app/print-extraction/page.tsx`
- `src/app/cutout/page.tsx`
- `src/app/api/print-extraction/jobs/route.ts`
- `src/app/api/cutout/jobs/route.ts`
- `src/lib/mockups/`
- `src/components/mockup-templates-manager.tsx`
- `mockup_templates` 和 `mockup_outputs` 的 migration 与接口使用方式

当前结论：

1. 印花提取和抠图目前是基于边缘背景色、颜色距离、亮度/饱和度阈值、连通区域和简单形态学处理的本地算法。
2. 该算法适合白底、黑底、纯色背景、浅色衣服深色图案、深色衣服浅色图案等简单场景。
3. 卡通图案、3D 效果图、背景和主体颜色接近、印花占比大、衣服纹理复杂时，目前算法容易误判。
4. 套图生成当前主要依赖模板里的 `print_area` 固定坐标，且套图任务代码优先使用 `processed_url ?? original_url`，没有优先使用 `preferred_design_url`、`print_extract_url`、`cutout_url`。
5. 套图模板删除逻辑目前会删除 `mockup_templates` 记录，并将历史 `mockup_outputs.template_id` 置空，因此删除后原模板无法再从模板列表中找回，这是当前数据设计导致的结果。

## 2. 问题一：卡通图案无法抠出

### 优先级

P1

### 可能原因

1. 当前抠图算法主要通过边缘背景色和 flood fill 判断背景，卡通图案如果背景复杂、边缘颜色多、主体贴边，就容易把图案当成背景。
2. 卡通图常有大面积纯色块、黑色描边、高饱和颜色，现有 `cutoutImage` 更偏向抠除背景，不会主动识别“高饱和主体”。
3. 当前页面没有提供局部框选、保留主体、阈值预览等交互，用户无法把处理范围限定到图案区域。

### 需要修改的文件

- `src/lib/image-ai/cutout.ts`
- `src/lib/image-ai/color.ts`
- `src/lib/image-ai/components.ts`
- `src/lib/image-ai/mask.ts`
- `src/app/cutout/page.tsx`
- `src/components/image-ai-processing-manager.tsx`
- `src/app/api/cutout/jobs/route.ts`

### 推荐算法修复方式

1. 新增“主体候选 mask”策略：
   - 高饱和区域保留。
   - 与边缘主背景色距离较大的区域保留。
   - 黑色描边区域保留。
   - 亮度和饱和度突变区域保留。
2. 当前背景 flood fill mask 不要作为唯一结果，应和主体候选 mask 做合并：
   - `finalKeepMask = invert(backgroundMask) OR subjectCandidateMask`
3. 增加连通区域评分：
   - 面积合理。
   - 靠近画面中心。
   - bbox 不贴满整张图。
   - 颜色丰富度高。
4. 对卡通图增加预设：
   - `cartoon_solid`
   - `high_saturation_subject`
5. 对透明 PNG 输入优先尊重原 alpha 通道，避免重新误判透明区域。

### 推荐页面交互修复方式

1. 在 `/cutout` 增加处理预设：
   - 自动背景
   - 白底
   - 黑底
   - 纯色背景
   - 卡通图案
2. 增加“处理强度”或“背景容差”滑块，默认值保守。
3. 显示 mask 预览和白底预览，让用户能看出哪里被保留。
4. 增加“只处理中心主体”的开关，适合卡通贴纸图。

### 数据库是否需要改动

短期不需要。当前 `image_derivatives.options`、`metrics`、`bbox` 可以记录预设、阈值、mask 面积、bbox 等信息。

### 是否需要新增 migration

不需要。

### 验收标准

1. 上传一张白底卡通贴纸图，选择“卡通图案”模式后能输出透明 PNG。
2. 输出图保留主体颜色和黑色描边。
3. 白底预览中主体完整，背景被移除。
4. `image_derivatives` 写入 `cutout`、`preview`、`mask` 记录。
5. 失败时返回中文错误，不能影响同批次其他图片。

## 3. 问题二：部分图片报错“印花范围过大”

### 优先级

P0

### 可能原因

1. `extractPrintFromImage` 当前对 `maskAreaRatio > 0.85` 直接判定为“印花范围过大”。
2. 当衣服区域、背景区域或整张商品图被误判为印花时，会触发该错误。
3. 对大幅印花、满版图案、3D 渲染图、海报式商品图，印花本身可能确实占比较大，不能简单按 0.85 失败。
4. 当前自动模式只在三种策略中选最高 confidence，没有二次修正过大的 mask。

### 需要修改的文件

- `src/lib/image-ai/print-extraction.ts`
- `src/lib/image-ai/components.ts`
- `src/lib/image-ai/morphology.ts`
- `src/app/print-extraction/page.tsx`
- `src/components/image-ai-processing-manager.tsx`
- `src/app/api/print-extraction/jobs/route.ts`

### 推荐算法修复方式

1. 将“mask 过大”从直接失败改成二次修正：
   - 提高颜色差阈值。
   - 优先保留高饱和、高对比、局部边缘强的区域。
   - 移除贴边的大连通区域。
   - 保留中心区域中面积合理的前几个组件。
2. 对大幅印花增加单独策略：
   - `large_print`
   - 允许较大 bbox，但要求边缘不贴满整图。
3. 引入中心 ROI 约束：
   - T 恤印花通常在画面中间上半区域。
   - 自动模式可先尝试中心 70% 宽、75% 高范围，降低衣服和背景误入 mask 的概率。
4. 调整失败条件：
   - `maskAreaRatio > 0.85` 不应直接失败。
   - 如果 bbox 贴满整图且边缘连通区域占比高，才判定为无效。
5. 在 `metrics` 中记录：
   - 初始 maskAreaRatio
   - 修正后 maskAreaRatio
   - selectedStrategy
   - rejectedLargeComponents

### 推荐页面交互修复方式

1. `/print-extraction` 增加“印花大小”预设：
   - 小胸标
   - 常规胸前图
   - 满版大图
2. 增加“中心区域优先”开关。
3. 增加“保留大面积印花”开关。
4. 下一阶段增加手动框选 `manual_rect`，用户可限定印花区域。

### 数据库是否需要改动

短期不需要。`options` 可以保存“印花大小预设”和“中心区域优先”等参数。

### 是否需要新增 migration

不需要。

### 验收标准

1. 对满版 T 恤图案不再直接报“印花范围过大”。
2. 对误识别整件衣服的图片，算法能二次收缩 mask 或返回更明确错误。
3. 自动模式失败率下降，同批 10 张测试图中成功输出数量明显提升。
4. 返回结果包含 `metrics.maskAreaRatio`、`metrics.bboxAreaRatio`、`metrics.selectedStrategy`。

## 4. 问题三：3D 效果图无法识别和提取

### 优先级

P1

### 可能原因

1. 3D 效果图通常有阴影、褶皱、高光、渐变和透视，颜色距离不稳定。
2. 当前算法没有局部对比、边缘强度、局部背景估计，只用全局边缘颜色和简单阈值。
3. 3D 图里的印花可能被弯曲、缩放或受光照影响，导致同一图案颜色不连续。
4. 当前没有模板化的“衣服区域/胸前区域”先验。

### 需要修改的文件

- `src/lib/image-ai/print-extraction.ts`
- `src/lib/image-ai/cutout.ts`
- `src/lib/image-ai/color.ts`
- `src/lib/image-ai/components.ts`
- `src/lib/image-ai/morphology.ts`
- `src/app/print-extraction/page.tsx`
- `src/components/image-ai-processing-manager.tsx`

### 推荐算法修复方式

1. 新增局部对比策略：
   - 对每个像素计算与周围窗口平均颜色的差异。
   - 保留局部差异大、饱和度高或亮度突变明显的区域。
2. 新增边缘增强策略：
   - 使用简单 Sobel 或亮度梯度计算边缘强度。
   - 与颜色 mask 合并，提高对印花边界的识别。
3. 对 3D T 恤效果图增加中心胸前 ROI：
   - 默认只在中心区域寻找印花。
   - 减少袖子、领口、阴影被误判。
4. 对 `dark_garment` 和 `light_garment` 引入局部背景估计：
   - 不只使用四边背景色。
   - 在 ROI 内估算衣服主色，再提取与衣服主色差异较大的区域。
5. 对阴影区域做容错：
   - 使用 HSV 中的饱和度和色相差异，不只看 RGB 距离。

### 推荐页面交互修复方式

1. `/print-extraction` 增加“3D 效果图”模式。
2. 增加“衣服颜色”辅助选项：
   - 浅色衣服
   - 深色衣服
   - 自动
3. 增加“处理范围”输入或手动框选，先用数字框 MVP，后续再做拖拽。
4. 显示原图、mask、最终透明图三栏预览，方便判断参数是否合适。

### 数据库是否需要改动

短期不需要。

如果要保存手动框选历史，可继续使用 `image_derivatives.options.manualRect`，无需新增字段。

### 是否需要新增 migration

不需要。

### 验收标准

1. 上传一张白色 T 恤 3D 效果图，能提取胸前深色或彩色印花。
2. 上传一张黑色 T 恤 3D 效果图，能提取浅色印花。
3. 阴影和衣服褶皱不应大面积进入最终透明 PNG。
4. 失败时提示“未检测到有效印花区域，请尝试 3D 效果图模式或手动框选”，而不是泛化错误。

## 5. 问题四：衣服和背景颜色相似时无法识别印花和人物

### 优先级

P1

### 可能原因

1. 当前抠图算法默认背景来自图片四边，如果衣服或人物贴边，会把衣服也当作背景。
2. 衣服和背景颜色相似时，RGB 颜色距离无法稳定区分主体和背景。
3. 当前没有主体中心先验、人像/衣服轮廓先验，也没有局部边缘闭合判断。
4. flood fill 使用颜色相近区域扩散，容易吞掉与背景相近的衣服。

### 需要修改的文件

- `src/lib/image-ai/cutout.ts`
- `src/lib/image-ai/color.ts`
- `src/lib/image-ai/components.ts`
- `src/lib/image-ai/morphology.ts`
- `src/app/cutout/page.tsx`
- `src/components/image-ai-processing-manager.tsx`

### 推荐算法修复方式

1. 对 `edge_flood_fill` 增加“边缘置信度”判断：
   - 如果边缘颜色分布不集中，降低 flood fill 权重。
   - 多边缘颜色分别 flood fill，再综合判断。
2. 新增中心主体保留策略：
   - 中心区域的连通组件优先保留。
   - 与边缘连通且贴边过多的区域优先判背景。
3. 使用亮度梯度边界限制 flood fill：
   - 如果相邻像素颜色相近但边缘梯度明显，应停止扩散。
4. 增加纯色背景模式的容错：
   - 估算多个边缘主色，而不是只用一个平均背景色。
5. 失败时不直接输出空结果，应提示尝试：
   - 调低 tolerance。
   - 开启中心主体优先。
   - 使用手动框选。

### 推荐页面交互修复方式

1. `/cutout` 增加“背景和主体颜色相近”模式。
2. 增加“中心主体优先”开关。
3. 增加 tolerance 的说明和建议范围。
4. 输出失败结果时展示具体建议，不只展示错误字符串。

### 数据库是否需要改动

不需要。参数仍可进入 `image_derivatives.options`。

### 是否需要新增 migration

不需要。

### 验收标准

1. 背景和浅色衣服接近时，主体不应被整块抠除。
2. 背景和深色衣服接近时，人物或商品主体至少能保留主要轮廓。
3. 同批处理失败项仍有明确错误原因，并不影响其他素材。
4. 成功结果能写入 `assets.cutout_url` 和可选的 `assets.preferred_design_url`。

## 6. 问题五：套图生成后印花位置不准确

### 优先级

P0

### 可能原因

1. 当前模板只支持 `print_area.x/y/width/height`，缺少对齐方式、缩放方式、旋转、偏移、安全边距等参数。
2. `renderScene` 使用 sharp `contain` 将印花塞入固定区域，不同印花宽高比差异大时视觉位置会偏。
3. 套图任务当前优先使用 `asset.processed_url ?? asset.original_url`，没有优先使用 `preferred_design_url`、`print_extract_url`、`cutout_url`，可能把未裁切原图直接放进套图。
4. 模板创建页面没有可视化预览和微调能力，坐标只能手填，容易不准。

### 需要修改的文件

- `src/lib/mockups/scenes.ts`
- `src/lib/mockups/render-preview.ts`
- `src/lib/mockups/mockup-job.ts`
- `src/components/mockup-templates-manager.tsx`
- `src/app/api/mockup-templates/preview/route.ts`
- `src/app/api/mockup-jobs/route.ts`
- `src/app/mockup-jobs/page.tsx`

### 推荐算法修复方式

1. 套图输入图优先级改为：
   - `preferred_design_url`
   - `print_extract_url`
   - `cutout_url`
   - `processed_url`
   - `original_url`
2. 对印花图先根据 alpha 或非白背景获取真实 bbox，再裁掉透明/空白边。
3. 增加 `print_area` 渲染参数：
   - `fit: contain | cover`
   - `align_x: left | center | right`
   - `align_y: top | center | bottom`
   - `offset_x`
   - `offset_y`
   - `scale`
   - `rotation`
4. 合成前统一处理印花透明边界，避免空白边导致视觉偏移。
5. 继续保持第一版不做复杂透视变形；如后续要支持真实服装透视，再新增独立能力。

### 推荐页面交互修复方式

1. 模板详情增加测试预览后可显示坐标区域。
2. 增加微调按钮：
   - 上移
   - 下移
   - 左移
   - 右移
   - 放大
   - 缩小
3. 场景配置 JSON 示例中增加新字段说明。
4. 在套图任务页面展示实际使用的印花来源 URL 类型，例如“使用最终印花图”。

### 数据库是否需要改动

建议改动，但可以分两步：

1. 短期不改表结构，直接把新增渲染参数放入 `mockup_templates.scenes` JSON。
2. 若需要模板版本管理和回溯，建议新增模板版本或快照字段。

### 是否需要新增 migration

短期修复印花来源和 JSON 参数不需要 migration。

如果要支持历史套图可回溯模板配置，建议新增 migration：

- 给 `mockup_outputs` 增加 `template_snapshot jsonb not null default '{}'::jsonb`
- 可选给 `mockup_outputs` 增加 `template_name text`

### 验收标准

1. 选择已设置 `preferred_design_url` 的素材生成套图时，实际使用 preferred 图片。
2. 带透明边的印花图合成后不再明显偏移。
3. 同一模板对 10 张不同比例印花图合成后，视觉中心基本一致。
4. 模板预览和批量套图输出位置一致。
5. 固定详情图 `need_print = false` 不受影响。

## 7. 问题六：删除套图模板后原先创建的模板找不到

### 优先级

P0

### 可能原因

1. 当前删除接口会删除 `mockup_templates` 记录。
2. 已有关联的 `mockup_outputs` 会被更新为 `template_id = null`，或依赖数据库 `on delete set null`。
3. 历史套图结果中没有保存模板快照，因此模板被删除后无法恢复模板名称、产品类型、scenes 配置。
4. “删除模板”对用户来说可能期望是从当前可用模板中隐藏，而不是永久删除历史配置。

### 需要修改的文件

- `src/app/api/mockup-templates/[templateId]/route.ts`
- `src/app/api/mockup-templates/route.ts`
- `src/components/mockup-templates-manager.tsx`
- `src/lib/mockups/mockup-job.ts`
- `supabase/migrations/*`

### 推荐算法修复方式

该问题不是图像算法问题，属于数据生命周期和页面交互问题。

### 推荐页面交互修复方式

1. 将“删除”改成“停用/归档”语义：
   - 默认模板列表不显示已归档模板。
   - 增加“显示已归档模板”筛选。
2. 删除确认文案区分两种情况：
   - 未使用模板：可以永久删除。
   - 已使用模板：建议归档，不建议永久删除。
3. 对已使用模板提供“归档模板”按钮，不直接硬删除。
4. 模板详情中显示历史套图数量，避免误删。

### 数据库是否需要改动

建议需要。

推荐方案：

1. 给 `mockup_templates` 增加：
   - `deleted_at timestamptz`
   - 或继续使用现有 `status`，新增状态 `archived`
2. 给 `mockup_outputs` 增加：
   - `template_snapshot jsonb not null default '{}'::jsonb`
   - 可选 `template_name text`
3. 创建套图结果时，把当时的模板配置写入 `mockup_outputs.template_snapshot`。

### 是否需要新增 migration

需要。

建议新增 migration：

1. `alter table public.mockup_templates add column if not exists deleted_at timestamptz;`
2. `alter table public.mockup_outputs add column if not exists template_snapshot jsonb not null default '{}'::jsonb;`
3. `alter table public.mockup_outputs add column if not exists template_name text;`
4. 为 `mockup_templates.deleted_at` 添加索引。

### 验收标准

1. 删除或归档已使用模板后，历史套图结果仍能看到当时的模板名称和配置快照。
2. 默认模板列表不显示归档模板，但可以通过筛选查看。
3. 未使用模板可以永久删除。
4. 已使用模板删除前会明确提示“建议归档，历史套图仍保留模板快照”。
5. 不删除 Supabase Storage 中的模板底图文件。

## 8. 推荐实施顺序

### 第一阶段：P0 修复

1. 修复印花提取“范围过大”直接失败的问题，增加二次收缩和更清晰错误。
2. 套图任务使用图片优先级改为 `preferred_design_url -> print_extract_url -> cutout_url -> processed_url -> original_url`。
3. 模板删除改为归档或软删除，并保存历史模板快照。

### 第二阶段：P1 算法增强

1. 抠图增加卡通图案模式。
2. 印花提取增加 3D 效果图模式。
3. 增加中心 ROI、局部对比、边缘梯度、组件评分。
4. 增强衣服和背景颜色相似场景的主体保留策略。

### 第三阶段：P1/P2 页面增强

1. `/print-extraction` 增加手动框选或数字 ROI。
2. `/cutout` 增加 mask 预览、参数预设和失败建议。
3. 套图模板增加坐标微调和预览确认。

## 9. 不建议本阶段做的事项

1. 不接外部图像 AI API。
2. 不接 remove.bg、Replicate、OpenAI、豆包、千问等图像 API。
3. 不引入 `opencv4nodejs`。
4. 不写入 `public` 目录。
5. 不改 `.env` 或任何密钥。
6. 不做复杂透视变形和拖拽编辑器。
7. 不做多平台自动上架。

## 10. 总体验收标准

1. 一张白底卡通图可以成功抠出透明 PNG。
2. 一张浅色 T 恤深色印花图可以提取最终印花 PNG。
3. 一张深色 T 恤浅色印花图可以提取最终印花 PNG。
4. 一张 3D T 恤效果图在 3D 模式下可以提取主要印花。
5. 衣服和背景颜色相近时，不应把主体大面积抠除。
6. “印花范围过大”场景应先尝试二次修正，无法修正时返回更明确建议。
7. 批量 10 张图片处理时，单张失败不影响其他图片。
8. 所有结果仍上传到 Supabase Storage 的 `assets` bucket。
9. 所有处理结果仍写入 `image_derivatives`，并按需要更新 `assets.print_extract_url`、`assets.cutout_url`、`assets.preferred_design_url`。
10. 套图生成优先使用最终印花图或首选设计图。
11. 删除或归档套图模板后，历史套图仍能查看模板快照。
12. `npm run lint` 和 `npm run build` 通过。
