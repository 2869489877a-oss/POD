"""AI 智能图像处理管线：AI识图分析 → rembg抠图 → OpenCV印花提取 → AI生图润色。"""

import io
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from rembg import remove, new_session

from qwen_vl_client import call_vision_json
from ai_image_client import polish_image

MAX_RETRIES = int(os.getenv("AI_MAX_RETRIES", "2"))

ANALYZE_PROMPT = """你是一个专业的图像处理分析师。请分析这张图片，判断最佳的处理方式。

请严格返回以下 JSON 格式（不要添加其他内容）：

```json
{
  "image_type": "garment_with_print / plain_garment / product_photo / pattern / other",
  "background_type": "white / light / dark / complex / transparent",
  "garment_color": "浅色 / 深色 / 彩色 / 无法判断",
  "has_print": true,
  "print_complexity": "simple / medium / complex / none",
  "print_description": "简短描述印花内容，如：卡通猫咪图案、几何线条、文字logo等",
  "recommended_model": "u2net / isnet-general-use / u2net_cloth_seg / u2net_human_seg / isnet-anime",
  "recommended_mode": "light_garment / dark_garment / high_contrast",
  "tolerance": 25,
  "sharpen": true,
  "denoise": true,
  "reasoning": "简短说明判断理由"
}
```

选择规则：
- 衣服类图片用 u2net_cloth_seg
- 通用产品/物体用 isnet-general-use
- 人物用 u2net_human_seg
- 动漫/插画用 isnet-anime
- tolerance: 浅色底衣服建议 20-35，深色底建议 35-60，高对比建议 15-25
- 浅色衣服用 light_garment，深色衣服用 dark_garment，高对比用 high_contrast
- 印花简单清晰时 sharpen=false，模糊或细节多时 sharpen=true
- 有噪点或压缩痕迹时 denoise=true"""

POLISH_PROMPT_TEMPLATE = """请优化这张提取出来的印花图案。
原始印花描述：{description}
要求：
- 修复边缘毛糙和锯齿
- 去除底色残留和噪点
- 保持印花原有颜色和细节不变
- 让图案边缘更加干净清晰
- 保持透明背景
请生成优化后的印花图片。"""


@dataclass
class AnalysisResult:
    image_type: str = "other"
    background_type: str = "complex"
    garment_color: str = "无法判断"
    has_print: bool = False
    print_complexity: str = "none"
    print_description: str = ""
    recommended_model: str = "isnet-general-use"
    recommended_mode: str = "light_garment"
    tolerance: int = 25
    sharpen: bool = True
    denoise: bool = True
    reasoning: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class ProcessingResult:
    success: bool = False
    model_used: str = ""
    mode_used: str = ""
    tolerance_used: int = 25
    analysis: AnalysisResult | None = None
    cutout_image: Image.Image | None = None
    print_image: Image.Image | None = None
    polished_image: Image.Image | None = None
    log: list = field(default_factory=list)


_session_cache = {}


def _get_session(model_name: str):
    if model_name not in _session_cache:
        _session_cache[model_name] = new_session(model_name)
    return _session_cache[model_name]


def _image_to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return buf.getvalue()


def _bytes_to_image(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGBA")


def analyze_image(image_bytes: bytes) -> AnalysisResult:
    """Step 1: AI 识图分析，决定处理策略。"""
    data = call_vision_json(ANALYZE_PROMPT, image_bytes)
    return AnalysisResult(
        image_type=data.get("image_type", "other"),
        background_type=data.get("background_type", "complex"),
        garment_color=data.get("garment_color", "无法判断"),
        has_print=bool(data.get("has_print", False)),
        print_complexity=data.get("print_complexity", "none"),
        print_description=data.get("print_description", ""),
        recommended_model=data.get("recommended_model", "isnet-general-use"),
        recommended_mode=data.get("recommended_mode", "light_garment"),
        tolerance=int(data.get("tolerance", 25)),
        sharpen=bool(data.get("sharpen", True)),
        denoise=bool(data.get("denoise", True)),
        reasoning=data.get("reasoning", ""),
        raw=data,
    )


def do_cutout(image_bytes: bytes, model: str) -> Image.Image:
    """Step 2: rembg 抠图，去除背景保留衣服主体。"""
    img = _bytes_to_image(image_bytes)
    session = _get_session(model)
    result = remove(img, session=session)
    return result


def do_print_extraction(cutout_img: Image.Image, mode: str, tolerance: int,
                        sharpen: bool = True, denoise: bool = True) -> Image.Image:
    """Step 3: OpenCV 从抠出的衣服上提取印花。"""
    import cv2

    arr = np.array(cutout_img)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]

    valid_mask = alpha > 128
    if not np.any(valid_mask):
        raise ValueError("抠图结果无有效像素，无法提取印花")

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    h, w = lab.shape[:2]

    # 采样衣服边缘区域的颜色作为底色
    edge_pixels = []
    margin = max(5, min(h, w) // 20)
    for y in range(h):
        for x in range(w):
            if valid_mask[y, x] and (y < margin or y >= h - margin or x < margin or x >= w - margin):
                edge_pixels.append(lab[y, x])
    if len(edge_pixels) < 10:
        edge_pixels = lab[valid_mask].tolist()[:500]
    base_color = np.median(edge_pixels, axis=0)

    # 根据模式调整阈值策略
    diff = np.sqrt(np.sum((lab - base_color) ** 2, axis=-1))

    if mode == "dark_garment":
        # 深色衣服：亮色区域更可能是印花
        luminance = lab[:, :, 0]
        bright_boost = np.where(luminance > 60, 10, 0)
        diff = diff + bright_boost
    elif mode == "high_contrast":
        # 高对比：直接用更低的容差
        tolerance = max(tolerance - 5, 10)

    print_mask = ((diff > tolerance) & valid_mask).astype(np.uint8) * 255

    # 形态学清理
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    print_mask = cv2.morphologyEx(print_mask, cv2.MORPH_OPEN, kernel)
    print_mask = cv2.morphologyEx(print_mask, cv2.MORPH_CLOSE, kernel)

    # 去噪
    if denoise:
        small_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        print_mask = cv2.morphologyEx(print_mask, cv2.MORPH_OPEN, small_kernel)

    # 边缘平滑
    print_mask = cv2.GaussianBlur(print_mask, (3, 3), 0)

    # 构建 RGBA 输出
    rgba = np.dstack([rgb, print_mask])
    result = Image.fromarray(rgba, "RGBA")

    # 裁剪到印花区域
    bbox = result.getbbox()
    if bbox:
        result = result.crop(bbox)

    # 锐化
    if sharpen:
        result = result.filter(ImageFilter.SHARPEN)

    return result


def do_polish(print_img: Image.Image, description: str) -> Image.Image:
    """Step 4: AI 生图润色优化印花。"""
    prompt = POLISH_PROMPT_TEMPLATE.format(description=description or "印花图案")
    image_bytes = _image_to_bytes(print_img)
    polished_bytes = polish_image(image_bytes, prompt)
    return _bytes_to_image(polished_bytes)


def smart_process(image_bytes: bytes, skip_polish: bool = False) -> ProcessingResult:
    """完整 AI 管线：AI识图 → rembg抠图 → OpenCV提取印花 → AI生图润色。"""
    result = ProcessingResult()
    result.log.append(f"[{_ts()}] 开始 AI 智能处理管线")

    # === Step 1: AI 识图分析 ===
    result.log.append(f"[{_ts()}] Step 1: 调用通义千问 VL 分析图片...")
    try:
        analysis = analyze_image(image_bytes)
    except Exception as e:
        result.log.append(f"[{_ts()}] AI 分析失败: {e}")
        result.success = False
        return result

    result.analysis = analysis
    result.model_used = analysis.recommended_model
    result.mode_used = analysis.recommended_mode
    result.tolerance_used = analysis.tolerance
    result.log.append(
        f"[{_ts()}] 分析结果: 类型={analysis.image_type}, "
        f"衣服颜色={analysis.garment_color}, 有印花={analysis.has_print}"
    )
    result.log.append(
        f"[{_ts()}] 策略: 模型={analysis.recommended_model}, "
        f"模式={analysis.recommended_mode}, 容差={analysis.tolerance}, "
        f"锐化={analysis.sharpen}, 去噪={analysis.denoise}"
    )
    result.log.append(f"[{_ts()}] 理由: {analysis.reasoning}")

    if not analysis.has_print:
        result.log.append(f"[{_ts()}] AI 判断图片无印花，仅执行抠图")

    # === Step 2: rembg 抠图 ===
    result.log.append(f"[{_ts()}] Step 2: rembg 抠图 (模型: {analysis.recommended_model})...")
    try:
        cutout = do_cutout(image_bytes, analysis.recommended_model)
        result.cutout_image = cutout
        result.log.append(f"[{_ts()}] 抠图完成，尺寸: {cutout.size}")
    except Exception as e:
        result.log.append(f"[{_ts()}] 抠图失败: {e}")
        result.success = False
        return result

    if not analysis.has_print:
        result.success = True
        result.log.append(f"[{_ts()}] 处理完成（无印花，仅抠图）")
        return result

    # === Step 3: OpenCV 印花提取 ===
    result.log.append(
        f"[{_ts()}] Step 3: OpenCV 印花提取 "
        f"(模式: {analysis.recommended_mode}, 容差: {analysis.tolerance})..."
    )
    try:
        print_img = do_print_extraction(
            cutout, analysis.recommended_mode, analysis.tolerance,
            sharpen=analysis.sharpen, denoise=analysis.denoise,
        )
        result.print_image = print_img
        result.log.append(f"[{_ts()}] 印花提取完成，尺寸: {print_img.size}")
    except Exception as e:
        result.log.append(f"[{_ts()}] 印花提取失败: {e}")
        result.success = True
        return result

    # === Step 4: AI 生图润色 ===
    if skip_polish:
        result.log.append(f"[{_ts()}] 跳过 AI 润色步骤")
        result.success = True
        return result

    result.log.append(f"[{_ts()}] Step 4: AI 生图润色优化印花...")
    try:
        polished = do_polish(print_img, analysis.print_description)
        result.polished_image = polished
        result.log.append(f"[{_ts()}] AI 润色完成，尺寸: {polished.size}")
    except Exception as e:
        result.log.append(f"[{_ts()}] AI 润色失败: {e}，使用原始提取结果")

    result.success = True
    result.log.append(f"[{_ts()}] 管线处理完成")
    return result


def _ts() -> str:
    return time.strftime("%H:%M:%S")
