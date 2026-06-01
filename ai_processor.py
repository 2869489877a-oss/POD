"""AI 智能图像处理管线：分析 → 处理 → 评估 → 重试。"""

import io
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import remove, new_session

from qwen_vl_client import call_vision_json

QUALITY_THRESHOLD = int(os.getenv("AI_QUALITY_THRESHOLD", "7"))
MAX_RETRIES = int(os.getenv("AI_MAX_RETRIES", "2"))

ANALYZE_PROMPT = """你是一个专业的图像处理分析师。请分析这张图片，判断最佳的处理方式。

请严格返回以下 JSON 格式（不要添加其他内容）：

```json
{
  "image_type": "garment_with_print / plain_garment / product_photo / pattern / other",
  "background_type": "white / light / dark / complex / transparent",
  "has_print": true/false,
  "print_complexity": "simple / medium / complex / none",
  "recommended_action": "cutout / print_extraction / both",
  "recommended_model": "u2net / isnet-general-use / u2net_cloth_seg / u2net_human_seg / isnet-anime",
  "recommended_mode": "auto / light_garment / dark_garment / high_contrast",
  "tolerance": 25,
  "reasoning": "简短说明判断理由"
}
```

选择规则：
- 衣服类图片用 u2net_cloth_seg
- 通用产品/物体用 isnet-general-use
- 人物用 u2net_human_seg
- 动漫/插画用 isnet-anime
- 如果衣服上有印花图案，recommended_action 选 both
- tolerance: 浅色底衣服建议 20-35，深色底建议 35-60，高对比建议 15-25
- 浅色衣服用 light_garment，深色衣服用 dark_garment"""

EVALUATE_PROMPT = """你是一个图像处理质量评估专家。我会给你两张图片：
- 第一张是原始图片
- 第二张是处理后的结果（{action}）

请评估处理结果的质量，严格返回以下 JSON 格式：

```json
{{
  "quality_score": 8,
  "issues": ["问题1", "问题2"],
  "pass": true,
  "suggested_adjustments": {{
    "model": "保持不变或建议更换的模型名",
    "tolerance": 25,
    "mode": "保持不变或建议更换的模式"
  }}
}}
```

评分标准：
- 10分：完美，无瑕疵
- 8-9分：优秀，细微瑕疵不影响使用
- 7分：合格，有小问题但可接受
- 5-6分：一般，有明显问题需要调整
- 1-4分：差，需要重新处理

常见问题：
- 抠图：边缘锯齿、残留背景、主体被裁切、透明区域有噪点
- 印花提取：底色残留、印花不完整、边缘模糊、颜色失真"""


@dataclass
class AnalysisResult:
    image_type: str = "other"
    background_type: str = "complex"
    has_print: bool = False
    print_complexity: str = "none"
    recommended_action: str = "cutout"
    recommended_model: str = "isnet-general-use"
    recommended_mode: str = "auto"
    tolerance: int = 25
    reasoning: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class EvaluationResult:
    quality_score: int = 0
    issues: list = field(default_factory=list)
    passed: bool = False
    suggested_adjustments: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)


@dataclass
class ProcessingResult:
    success: bool = False
    action: str = ""
    model_used: str = ""
    mode_used: str = ""
    tolerance_used: int = 25
    attempts: int = 0
    final_score: int = 0
    analysis: AnalysisResult | None = None
    evaluation: EvaluationResult | None = None
    result_image: Image.Image | None = None
    cutout_image: Image.Image | None = None
    print_image: Image.Image | None = None
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
    """用 AI 分析图片，返回推荐的处理策略。"""
    data = call_vision_json(ANALYZE_PROMPT, image_bytes)
    return AnalysisResult(
        image_type=data.get("image_type", "other"),
        background_type=data.get("background_type", "complex"),
        has_print=bool(data.get("has_print", False)),
        print_complexity=data.get("print_complexity", "none"),
        recommended_action=data.get("recommended_action", "cutout"),
        recommended_model=data.get("recommended_model", "isnet-general-use"),
        recommended_mode=data.get("recommended_mode", "auto"),
        tolerance=int(data.get("tolerance", 25)),
        reasoning=data.get("reasoning", ""),
        raw=data,
    )


def evaluate_result(original_bytes: bytes, result_bytes: bytes, action: str) -> EvaluationResult:
    """用 AI 评估处理结果质量。"""
    prompt = EVALUATE_PROMPT.format(action=action)
    data = call_vision_json(prompt, original_bytes, result_bytes)
    return EvaluationResult(
        quality_score=int(data.get("quality_score", 0)),
        issues=data.get("issues", []),
        passed=bool(data.get("pass", False)),
        suggested_adjustments=data.get("suggested_adjustments", {}),
        raw=data,
    )


def _do_cutout(image_bytes: bytes, model: str) -> bytes:
    """执行 rembg 抠图，返回 PNG bytes。"""
    img = _bytes_to_image(image_bytes)
    session = _get_session(model)
    result = remove(img, session=session)
    return _image_to_bytes(result)


def _do_print_extraction(image_bytes: bytes, mode: str, tolerance: int) -> bytes:
    """执行印花提取，返回 PNG bytes。"""
    import cv2

    img = _bytes_to_image(image_bytes)
    arr = np.array(img.convert("RGB"))

    lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB).astype(np.float32)
    h, w = lab.shape[:2]

    edge_samples = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]], axis=0)
    base_color = np.median(edge_samples, axis=0)

    diff = np.sqrt(np.sum((lab - base_color) ** 2, axis=-1))
    mask = (diff > tolerance).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.GaussianBlur(mask, (3, 3), 0)

    rgba = np.dstack([arr, mask])
    result = Image.fromarray(rgba, "RGBA")
    return _image_to_bytes(result)


def smart_process(image_bytes: bytes) -> ProcessingResult:
    """完整 AI 管线：分析 → 处理 → 评估 → 重试。"""
    result = ProcessingResult()
    result.log.append(f"[{_ts()}] 开始 AI 智能处理")

    # Step 1: AI 分析
    result.log.append(f"[{_ts()}] 正在调用 AI 分析图片...")
    try:
        analysis = analyze_image(image_bytes)
    except Exception as e:
        result.log.append(f"[{_ts()}] AI 分析失败: {e}")
        result.success = False
        return result

    result.analysis = analysis
    result.log.append(
        f"[{_ts()}] AI 分析完成: 类型={analysis.image_type}, "
        f"背景={analysis.background_type}, 有印花={analysis.has_print}, "
        f"推荐动作={analysis.recommended_action}, 模型={analysis.recommended_model}, "
        f"模式={analysis.recommended_mode}, 容差={analysis.tolerance}"
    )
    result.log.append(f"[{_ts()}] AI 理由: {analysis.reasoning}")

    model = analysis.recommended_model
    mode = analysis.recommended_mode
    tolerance = analysis.tolerance
    action = analysis.recommended_action

    for attempt in range(1, MAX_RETRIES + 2):
        result.attempts = attempt
        result.model_used = model
        result.mode_used = mode
        result.tolerance_used = tolerance
        result.action = action

        result.log.append(f"[{_ts()}] 第 {attempt} 次处理: model={model}, mode={mode}, tolerance={tolerance}")

        try:
            if action in ("cutout", "both"):
                cutout_bytes = _do_cutout(image_bytes, model)
                result.cutout_image = _bytes_to_image(cutout_bytes)
                result.result_image = result.cutout_image

            if action in ("print_extraction", "both"):
                print_bytes = _do_print_extraction(image_bytes, mode, tolerance)
                result.print_image = _bytes_to_image(print_bytes)
                if action == "print_extraction":
                    result.result_image = result.print_image
        except Exception as e:
            result.log.append(f"[{_ts()}] 处理失败: {e}")
            result.success = False
            return result

        # Step 3: AI 评估
        eval_target = result.cutout_image if action in ("cutout", "both") else result.print_image
        if eval_target is None:
            result.log.append(f"[{_ts()}] 无处理结果可评估")
            result.success = False
            return result

        eval_action = "抠图" if action in ("cutout", "both") else "印花提取"
        result_bytes_for_eval = _image_to_bytes(eval_target)

        result.log.append(f"[{_ts()}] 正在调用 AI 评估结果质量...")
        try:
            evaluation = evaluate_result(image_bytes, result_bytes_for_eval, eval_action)
        except Exception as e:
            result.log.append(f"[{_ts()}] AI 评估失败: {e}，视为通过")
            evaluation = EvaluationResult(quality_score=7, passed=True)

        result.evaluation = evaluation
        result.final_score = evaluation.quality_score
        result.log.append(
            f"[{_ts()}] 评估结果: 分数={evaluation.quality_score}/10, "
            f"通过={evaluation.passed}, 问题={evaluation.issues}"
        )

        if evaluation.passed or evaluation.quality_score >= QUALITY_THRESHOLD:
            result.success = True
            result.log.append(f"[{_ts()}] 质量合格，处理完成")
            return result

        if attempt > MAX_RETRIES:
            result.log.append(f"[{_ts()}] 已达最大重试次数，使用当前结果")
            result.success = True
            return result

        # 根据 AI 建议调整参数
        adj = evaluation.suggested_adjustments
        if adj.get("model") and adj["model"] != model:
            model = adj["model"]
        if adj.get("tolerance") and adj["tolerance"] != tolerance:
            tolerance = int(adj["tolerance"])
        if adj.get("mode") and adj["mode"] != mode:
            mode = adj["mode"]

        result.log.append(f"[{_ts()}] AI 建议调整: model={model}, mode={mode}, tolerance={tolerance}")

    result.success = True
    return result


def _ts() -> str:
    return time.strftime("%H:%M:%S")
