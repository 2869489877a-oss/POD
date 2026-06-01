import os
os.environ["no_proxy"] = "localhost,127.0.0.1,0.0.0.0"

import gradio as gr
import numpy as np
from PIL import Image, ImageFilter, ImageChops, ImageEnhance
from rembg import remove, new_session
import cv2

MODELS = [
    "u2net",
    "u2net_human_seg",
    "u2net_cloth_seg",
    "isnet-general-use",
    "isnet-anime",
]

session_cache = {}


def get_session(model_name):
    if model_name not in session_cache:
        session_cache[model_name] = new_session(model_name)
    return session_cache[model_name]


def process_image(image_dict, model_name, use_roi):
    """
    image_dict comes from gr.ImageEditor:
      - "background": original image (PIL)
      - "layers": list of layer dicts, each with drawn annotations
      - "composite": final composited image
    """
    if image_dict is None:
        return None

    bg = image_dict.get("background")
    if bg is None:
        return None

    original = bg.convert("RGBA")
    roi_box = None

    if use_roi:
        layers = image_dict.get("layers", [])
        roi_box = _extract_bbox_from_layers(layers)

    session = get_session(model_name)

    if roi_box:
        x1, y1, x2, y2 = roi_box
        cropped = original.crop((x1, y1, x2, y2))
        result_crop = remove(cropped, session=session)
        result = Image.new("RGBA", original.size, (0, 0, 0, 0))
        result.paste(result_crop, (x1, y1))
    else:
        result = remove(original, session=session)

    return result


def _extract_bbox_from_layers(layers):
    """Extract bounding box from drawn rectangles/strokes on layers."""
    for layer in layers:
        if isinstance(layer, dict):
            layer_img = layer.get("composite") or layer.get("image")
        else:
            layer_img = layer

        if layer_img is None:
            continue

        if not isinstance(layer_img, Image.Image):
            try:
                layer_img = Image.fromarray(np.array(layer_img))
            except Exception:
                continue

        arr = np.array(layer_img.convert("RGBA"))
        alpha = arr[:, :, 3]
        coords = np.where(alpha > 10)
        if len(coords[0]) == 0:
            continue

        y1, y2 = int(coords[0].min()), int(coords[0].max())
        x1, x2 = int(coords[1].min()), int(coords[1].max())

        if (x2 - x1) > 5 and (y2 - y1) > 5:
            return (x1, y1, x2, y2)

    return None


def apply_print(garment_dict, print_image, blend_mode, opacity, wrinkle_strength):
    """Apply a print pattern onto a garment template."""
    if garment_dict is None or print_image is None:
        return None

    bg = garment_dict.get("background")
    if bg is None:
        return None

    garment = np.array(bg.convert("RGB"))
    layers = garment_dict.get("layers", [])
    roi_box = _extract_bbox_from_layers(layers)

    if roi_box is None:
        h, w = garment.shape[:2]
        roi_box = (w // 4, h // 4, w * 3 // 4, h * 3 // 4)

    x1, y1, x2, y2 = roi_box
    roi_w, roi_h = x2 - x1, y2 - y1

    print_img = np.array(print_image.convert("RGBA").resize((roi_w, roi_h), Image.LANCZOS))
    print_rgb = print_img[:, :, :3]
    print_alpha = print_img[:, :, 3].astype(np.float32) / 255.0 * (opacity / 100.0)

    roi_region = garment[y1:y2, x1:x2].copy()

    if wrinkle_strength > 0:
        gray = cv2.cvtColor(roi_region, cv2.COLOR_RGB2GRAY).astype(np.float32)
        blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=5)
        highpass = gray - blur
        displacement = (highpass / 255.0) * wrinkle_strength
        rows, cols = np.mgrid[0:roi_h, 0:roi_w].astype(np.float32)
        map_x = (cols + displacement).astype(np.float32)
        map_y = (rows + displacement).astype(np.float32)
        print_rgb = cv2.remap(print_rgb, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    if blend_mode == "正片叠底 (Multiply)":
        blended = (roi_region.astype(np.float32) * print_rgb.astype(np.float32) / 255.0)
    elif blend_mode == "叠加 (Overlay)":
        base = roi_region.astype(np.float32) / 255.0
        top = print_rgb.astype(np.float32) / 255.0
        mask_low = base < 0.5
        blended = np.where(mask_low, 2 * base * top, 1 - 2 * (1 - base) * (1 - top))
        blended = blended * 255.0
    else:
        blended = print_rgb.astype(np.float32)

    blended = np.clip(blended, 0, 255).astype(np.uint8)

    alpha_3ch = np.stack([print_alpha] * 3, axis=-1)
    result_roi = (alpha_3ch * blended + (1 - alpha_3ch) * roi_region).astype(np.uint8)

    result = garment.copy()
    result[y1:y2, x1:x2] = result_roi

    return Image.fromarray(result)


def extract_print(garment_dict, tolerance, refine_edges, output_mode):
    """Extract print pattern from a garment by removing the base fabric color."""
    if garment_dict is None:
        return None

    bg = garment_dict.get("background")
    if bg is None:
        return None

    garment = np.array(bg.convert("RGB"))
    layers = garment_dict.get("layers", [])
    roi_box = _extract_bbox_from_layers(layers)

    if roi_box:
        x1, y1, x2, y2 = roi_box
        region = garment[y1:y2, x1:x2]
    else:
        region = garment
        x1, y1 = 0, 0

    lab = cv2.cvtColor(region, cv2.COLOR_RGB2LAB).astype(np.float32)

    edge_samples = np.concatenate([
        lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]
    ], axis=0)
    base_color = np.median(edge_samples, axis=0)

    diff = np.sqrt(np.sum((lab - base_color) ** 2, axis=-1))

    mask = (diff > tolerance).astype(np.uint8) * 255

    if refine_edges:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.GaussianBlur(mask, (3, 3), 0)

    if output_mode == "透明底 PNG":
        rgba = np.dstack([region, mask])
        result = Image.fromarray(rgba, "RGBA")
    elif output_mode == "黑底预览":
        black_bg = np.zeros_like(region)
        mask_3ch = np.stack([mask / 255.0] * 3, axis=-1)
        composited = (mask_3ch * region + (1 - mask_3ch) * black_bg).astype(np.uint8)
        result = Image.fromarray(composited)
    else:
        white_bg = np.full_like(region, 255)
        mask_3ch = np.stack([mask / 255.0] * 3, axis=-1)
        composited = (mask_3ch * region + (1 - mask_3ch) * white_bg).astype(np.uint8)
        result = Image.fromarray(composited)

    return result


with gr.Blocks(title="Rembg 智能抠图") as demo:
    gr.Markdown("# Rembg 智能工具箱\n抠图 + 贴印花 + 摘印花")

    with gr.Tabs():
        with gr.TabItem("抠图"):
            with gr.Row():
                with gr.Column(scale=1):
                    model_dropdown = gr.Dropdown(
                        choices=MODELS,
                        value="u2net",
                        label="选择模型",
                        info="u2net_cloth_seg 适合衣服，isnet-general-use 通用效果好",
                    )
                    use_roi_checkbox = gr.Checkbox(
                        value=True,
                        label="启用框选模式",
                        info="勾选后，用画笔在图上画框圈出要保留的物体",
                    )
                    run_btn = gr.Button("开始抠图", variant="primary", size="lg")

                with gr.Column(scale=2):
                    input_image = gr.ImageEditor(
                        label="上传图片并画框（用画笔画一个矩形框住目标）",
                        type="pil",
                        sources=["upload", "clipboard"],
                        brush=gr.Brush(default_size=3, colors=["#FF0000"]),
                        eraser=False,
                    )

            with gr.Row():
                output_image = gr.Image(label="抠图结果", type="pil", format="png")

            run_btn.click(
                fn=process_image,
                inputs=[input_image, model_dropdown, use_roi_checkbox],
                outputs=output_image,
            )

        with gr.TabItem("贴印花"):
            gr.Markdown("上传衣服模板，画框指定印花区域，上传印花图，生成效果图。")
            with gr.Row():
                with gr.Column(scale=1):
                    print_upload = gr.Image(
                        label="上传印花图",
                        type="pil",
                        sources=["upload", "clipboard"],
                    )
                    blend_dropdown = gr.Dropdown(
                        choices=["正片叠底 (Multiply)", "叠加 (Overlay)", "直接覆盖 (Normal)"],
                        value="正片叠底 (Multiply)",
                        label="混合模式",
                        info="正片叠底最自然，叠加更鲜艳",
                    )
                    opacity_slider = gr.Slider(
                        minimum=10, maximum=100, value=85,
                        label="印花不透明度 %",
                    )
                    wrinkle_slider = gr.Slider(
                        minimum=0, maximum=20, value=5,
                        label="褶皱跟随强度",
                        info="越大印花越跟随布料褶皱",
                    )
                    print_btn = gr.Button("生成效果图", variant="primary", size="lg")

                with gr.Column(scale=2):
                    garment_editor = gr.ImageEditor(
                        label="上传衣服模板并画框指定印花区域",
                        type="pil",
                        sources=["upload", "clipboard"],
                        brush=gr.Brush(default_size=3, colors=["#00FF00"]),
                        eraser=False,
                    )

            with gr.Row():
                print_output = gr.Image(label="效果图", type="pil", format="png")

            print_btn.click(
                fn=apply_print,
                inputs=[garment_editor, print_upload, blend_dropdown, opacity_slider, wrinkle_slider],
                outputs=print_output,
            )

        with gr.TabItem("摘印花"):
            gr.Markdown("从衣服照片中提取印花图案。适合纯色/浅色底的衣服，画框可只选印花区域。")
            with gr.Row():
                with gr.Column(scale=1):
                    extract_tolerance = gr.Slider(
                        minimum=5, maximum=80, value=25,
                        label="容差",
                        info="越小越严格（只去掉非常接近底色的），越大去掉更多底色",
                    )
                    extract_refine = gr.Checkbox(
                        value=True,
                        label="边缘优化",
                        info="去除噪点、平滑边缘",
                    )
                    extract_output_mode = gr.Dropdown(
                        choices=["透明底 PNG", "白底预览", "黑底预览"],
                        value="透明底 PNG",
                        label="输出格式",
                    )
                    extract_btn = gr.Button("提取印花", variant="primary", size="lg")

                with gr.Column(scale=2):
                    extract_editor = gr.ImageEditor(
                        label="上传衣服照片（可画框只选印花区域）",
                        type="pil",
                        sources=["upload", "clipboard"],
                        brush=gr.Brush(default_size=3, colors=["#FF00FF"]),
                        eraser=False,
                    )

            with gr.Row():
                extract_output = gr.Image(label="提取结果", type="pil", format="png")

            extract_btn.click(
                fn=extract_print,
                inputs=[extract_editor, extract_tolerance, extract_refine, extract_output_mode],
                outputs=extract_output,
            )

    gr.Markdown(
        "### 使用说明\n"
        "**抠图**：上传图片 → 画框选区域 → 选模型 → 开始抠图\n\n"
        "**贴印花**：上传衣服模板 → 画框指定印花位置 → 上传印花图 → 调参数 → 生成效果图\n\n"
        "**摘印花**：上传衣服照片 → 画框圈住印花区域 → 调容差 → 提取印花"
    )

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, theme=gr.themes.Soft())
