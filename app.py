import os
os.environ["no_proxy"] = "localhost,127.0.0.1,0.0.0.0"

from pathlib import Path


APP_DIR = Path(__file__).resolve().parent


def _load_local_env():
    env_path = APP_DIR / "rembg-local.env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _get_int(name, default):
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} 必须是整数") from exc

    if value <= 0:
        raise ValueError(f"{name} 必须大于 0")

    return value


def _get_bool(name, default):
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    normalized = raw_value.lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False

    raise ValueError(f"{name} 必须是 true 或 false")


_load_local_env()

SERVER_NAME = os.getenv("REMBG_LOCAL_HOST", "127.0.0.1").strip() or "127.0.0.1"
SERVER_PORT = _get_int("REMBG_LOCAL_PORT", 7860)
OPEN_BROWSER = _get_bool("REMBG_LOCAL_OPEN_BROWSER", True)
SHARE = _get_bool("REMBG_LOCAL_SHARE", False)
MAX_CONCURRENT_REQUESTS = _get_int("REMBG_LOCAL_MAX_CONCURRENT", 1)
QUEUE_MAX_SIZE = _get_int("REMBG_LOCAL_QUEUE_MAX_SIZE", 8)
MAX_FILE_SIZE = os.getenv("REMBG_LOCAL_MAX_FILE_SIZE", "50mb").strip() or "50mb"

os.environ.setdefault("U2NET_HOME", str(APP_DIR / ".u2net"))

import gradio as gr
import numpy as np
from PIL import Image, ImageFilter, ImageChops, ImageEnhance
from rembg import remove, new_session
import cv2
import json

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
    import threading
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import io

    API_SECRET = os.getenv("REMBG_API_SECRET", "")

    class RembgAPIHandler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def _check_auth(self):
            if not API_SECRET:
                return True
            auth = self.headers.get("Authorization", "")
            return auth == f"Bearer {API_SECRET}"

        def do_POST(self):
            if not self._check_auth():
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b"unauthorized")
                return
            if self.path == "/api/remove":
                self._handle_remove()
            elif self.path == "/api/extract-print":
                self._handle_extract_print()
            else:
                self.send_response(404)
                self.end_headers()

        def _read_image_from_body(self):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            import cgi
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                environ = {
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": content_type,
                    "CONTENT_LENGTH": str(content_length),
                }
                fs = cgi.FieldStorage(fp=io.BytesIO(body), environ=environ, keep_blank_values=True)
                file_item = fs["file"] if "file" in fs else None
                model_name = fs.getvalue("model", "isnet-general-use")
                options_raw = fs.getvalue("options", "{}")
                if file_item is None:
                    return None, None, None
                img_bytes = file_item.file.read()
            else:
                img_bytes = body
                model_name = "isnet-general-use"
                options_raw = "{}"
            try:
                options = json.loads(options_raw) if isinstance(options_raw, str) else {}
            except Exception:
                options = {}
            return img_bytes, model_name, options

        def _handle_remove(self):
            img_bytes, model_name, _ = self._read_image_from_body()
            if img_bytes is None:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"missing file")
                return
            try:
                input_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
                session = get_session(model_name)
                result = remove(input_img, session=session)
                buf = io.BytesIO()
                result.save(buf, format="PNG")
                png_data = buf.getvalue()
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(png_data)))
                self.end_headers()
                self.wfile.write(png_data)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())

        def _handle_extract_print(self):
            """7-step print extraction pipeline:
            1. rembg remove garment background
            2. OpenCV find print region contours
            3. Perspective correction
            4. Denoise + sharpen + edge enhance
            5. (AI inpaint placeholder - returns mask for client)
            6. Quality metrics for human review
            7. Output PNG
            """
            img_bytes, model_name, options = self._read_image_from_body()
            if img_bytes is None:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"missing file")
                return

            tolerance = int(options.get("tolerance", 60))
            sharpen = bool(options.get("sharpen", True))
            denoise = bool(options.get("denoise", True))
            correct_perspective = bool(options.get("correct_perspective", True))

            try:
                # Step 1: rembg isolate garment from background
                input_img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")
                session = get_session(model_name)
                isolated = remove(input_img, session=session)
                isolated_np = np.array(isolated)

                # Step 2: Find print region via color difference
                rgb = isolated_np[:, :, :3]
                alpha = isolated_np[:, :, 3]
                # Only consider pixels with alpha > 128
                valid_mask = alpha > 128
                if not np.any(valid_mask):
                    raise ValueError("No valid pixels after background removal")

                # Sample edge colors as base fabric color
                lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
                h, w = lab.shape[:2]
                edge_pixels = []
                margin = max(5, min(h, w) // 20)
                for y in range(h):
                    for x in range(w):
                        if valid_mask[y, x] and (y < margin or y >= h - margin or x < margin or x >= w - margin):
                            edge_pixels.append(lab[y, x])
                if len(edge_pixels) < 10:
                    edge_pixels = lab[valid_mask].tolist()[:500]
                base_color = np.median(edge_pixels, axis=0)

                # Color difference mask
                diff = np.sqrt(np.sum((lab - base_color) ** 2, axis=-1))
                print_mask = ((diff > tolerance) & valid_mask).astype(np.uint8) * 255

                # Morphological cleanup
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                print_mask = cv2.morphologyEx(print_mask, cv2.MORPH_OPEN, kernel)
                print_mask = cv2.morphologyEx(print_mask, cv2.MORPH_CLOSE, kernel)

                # Find largest contour as print region
                contours, _ = cv2.findContours(print_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if not contours:
                    raise ValueError("No print region detected")

                largest = max(contours, key=cv2.contourArea)
                x_r, y_r, w_r, h_r = cv2.boundingRect(largest)

                # Step 3: Perspective correction
                region = rgb[y_r:y_r+h_r, x_r:x_r+w_r]
                region_mask = print_mask[y_r:y_r+h_r, x_r:x_r+w_r]

                if correct_perspective and len(largest) >= 4:
                    epsilon = 0.02 * cv2.arcLength(largest, True)
                    approx = cv2.approxPolyDP(largest, epsilon, True)
                    if len(approx) == 4:
                        pts = approx.reshape(4, 2).astype(np.float32)
                        pts = pts - np.array([x_r, y_r], dtype=np.float32)
                        rect = np.array([[0, 0], [w_r-1, 0], [w_r-1, h_r-1], [0, h_r-1]], dtype=np.float32)
                        # Order points
                        s = pts.sum(axis=1)
                        d = np.diff(pts, axis=1).flatten()
                        ordered = np.zeros((4, 2), dtype=np.float32)
                        ordered[0] = pts[np.argmin(s)]
                        ordered[2] = pts[np.argmax(s)]
                        ordered[1] = pts[np.argmin(d)]
                        ordered[3] = pts[np.argmax(d)]
                        M = cv2.getPerspectiveTransform(ordered, rect)
                        region = cv2.warpPerspective(region, M, (w_r, h_r))
                        region_mask = cv2.warpPerspective(region_mask, M, (w_r, h_r))

                # Step 4: Denoise + sharpen
                if denoise:
                    region = cv2.fastNlMeansDenoisingColored(region, None, 6, 6, 7, 21)

                if sharpen:
                    blur = cv2.GaussianBlur(region, (0, 0), 3)
                    region = cv2.addWeighted(region, 1.5, blur, -0.5, 0)

                # Edge enhance on mask
                region_mask = cv2.GaussianBlur(region_mask, (3, 3), 0)

                # Step 5: Build output with alpha (AI inpaint would go here)
                rgba = np.dstack([region, region_mask])
                result_img = Image.fromarray(rgba, "RGBA")

                # Step 6: Quality metrics
                non_zero = np.count_nonzero(region_mask)
                total = region_mask.shape[0] * region_mask.shape[1]
                coverage = non_zero / total if total > 0 else 0
                metrics = {
                    "width": w_r,
                    "height": h_r,
                    "coverage": round(coverage, 3),
                    "contour_area": int(cv2.contourArea(largest)),
                    "steps_applied": ["rembg", "contour_detect", "perspective" if correct_perspective else "skip", "denoise" if denoise else "skip", "sharpen" if sharpen else "skip"],
                }

                # Step 7: Output PNG
                buf = io.BytesIO()
                result_img.save(buf, format="PNG")
                png_data = buf.getvalue()

                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(png_data)))
                self.send_header("X-Metrics", json.dumps(metrics))
                self.end_headers()
                self.wfile.write(png_data)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())

    def run_api_server():
        api_port = SERVER_PORT + 1
        server = HTTPServer(("0.0.0.0", api_port), RembgAPIHandler)
        print(f"* Rembg API running on http://0.0.0.0:{api_port}/api/remove")
        server.serve_forever()

    threading.Thread(target=run_api_server, daemon=True).start()

    demo.queue(
        max_size=QUEUE_MAX_SIZE,
        default_concurrency_limit=MAX_CONCURRENT_REQUESTS,
    )
    demo.launch(
        server_name=SERVER_NAME,
        server_port=SERVER_PORT,
        inbrowser=OPEN_BROWSER,
        share=SHARE,
        max_threads=max(2, MAX_CONCURRENT_REQUESTS),
        max_file_size=MAX_FILE_SIZE,
        theme=gr.themes.Soft(),
    )
