import io
import json
import os
import socket
import time
from pathlib import Path
from typing import Any

import cv2
import httpx
import numpy as np
from PIL import Image, ImageOps
from rembg import new_session, remove


APP_DIR = Path(__file__).resolve().parent
ENV_PATH = APP_DIR / "local-worker.env"
SESSION_CACHE: dict[str, object] = {}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    value = int(raw_value)
    if value <= 0:
        raise ValueError(f"{name} 必须大于 0")
    return value


def get_float(name: str, default: float) -> float:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    value = float(raw_value)
    if value <= 0:
        raise ValueError(f"{name} 必须大于 0")
    return value


def get_list(name: str, default: list[str]) -> list[str]:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default

    values = [item.strip() for item in raw_value.split(",") if item.strip()]
    return values or default


load_env_file(ENV_PATH)

POD_API_URL = os.getenv("POD_API_URL", "http://127.0.0.1:3000").rstrip("/")
LOCAL_WORKER_SECRET = os.getenv("LOCAL_WORKER_SECRET", "").strip()
LOCAL_WORKER_ID = os.getenv("LOCAL_WORKER_ID", socket.gethostname()).strip() or "local-worker"
LOCAL_WORKER_JOB_TYPES = get_list("LOCAL_WORKER_JOB_TYPES", ["cutout", "print_extraction"])
POLL_INTERVAL_SECONDS = get_float("POLL_INTERVAL_SECONDS", 5.0)
REQUEST_TIMEOUT_SECONDS = get_int("LOCAL_WORKER_REQUEST_TIMEOUT_SECONDS", 120)
MAX_IMAGE_SIZE_MB = get_int("LOCAL_WORKER_MAX_IMAGE_SIZE_MB", 50)
REMBG_MODEL = os.getenv("LOCAL_REMBG_MODEL", "isnet-general-use").strip() or "isnet-general-use"
PRINT_TOLERANCE = get_int("LOCAL_PRINT_TOLERANCE", 25)

os.environ.setdefault("U2NET_HOME", str(APP_DIR / ".u2net"))


def require_config() -> None:
    if not LOCAL_WORKER_SECRET:
        raise RuntimeError("请在 local-worker.env 中配置 LOCAL_WORKER_SECRET")


def get_session(model_name: str):
    if model_name not in SESSION_CACHE:
        print(f"加载 rembg 模型：{model_name}", flush=True)
        SESSION_CACHE[model_name] = new_session(model_name)
    return SESSION_CACHE[model_name]


def to_png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def to_preview_jpg(image: Image.Image) -> bytes:
    preview = Image.new("RGBA", image.size, (255, 255, 255, 255))
    preview.alpha_composite(image.convert("RGBA"))
    output = io.BytesIO()
    preview.convert("RGB").save(output, format="JPEG", quality=88)
    return output.getvalue()


def alpha_mask_png(image: Image.Image) -> bytes:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    output = io.BytesIO()
    alpha.save(output, format="PNG")
    return output.getvalue()


def resize_if_needed(image: Image.Image, max_size: int) -> Image.Image:
    if max_size <= 0 or max(image.size) <= max_size:
        return image

    resized = image.copy()
    resized.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    return resized


def load_image(image_bytes: bytes, max_size: int) -> Image.Image:
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGBA")
    return resize_if_needed(image, max_size)


def parse_rect(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None

    try:
        x = int(float(value.get("x")))
        y = int(float(value.get("y")))
        width = int(float(value.get("width")))
        height = int(float(value.get("height")))
    except (TypeError, ValueError):
        return None

    if width <= 0 or height <= 0:
        return None

    return {"height": height, "width": width, "x": x, "y": y}


def clamp_rect(rect: dict[str, int], width: int, height: int) -> dict[str, int]:
    x = max(0, min(rect["x"], width - 1))
    y = max(0, min(rect["y"], height - 1))
    x2 = max(x + 1, min(x + rect["width"], width))
    y2 = max(y + 1, min(y + rect["height"], height))
    return {"height": y2 - y, "width": x2 - x, "x": x, "y": y}


def process_cutout(image_bytes: bytes, job: dict[str, Any]) -> dict[str, Any]:
    options = job.get("options", {}).get("options", {})
    max_size = int(options.get("maxSize") or 1800)
    model_name = str(options.get("model") or REMBG_MODEL)

    image = load_image(image_bytes, max_size)
    result = remove(image, session=get_session(model_name))
    if not isinstance(result, Image.Image):
        result = Image.open(io.BytesIO(result)).convert("RGBA")
    else:
        result = result.convert("RGBA")

    return {
        "bbox": {"height": result.height, "width": result.width, "x": 0, "y": 0},
        "height": result.height,
        "mask": alpha_mask_png(result),
        "metrics": {"model": model_name, "source": "local_worker_rembg"},
        "output": to_png_bytes(result),
        "preview": to_preview_jpg(result),
        "width": result.width,
    }


def extract_print_mask(region: np.ndarray, tolerance: int) -> np.ndarray:
    lab = cv2.cvtColor(region, cv2.COLOR_RGB2LAB).astype(np.float32)
    edge_samples = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]], axis=0)
    base_color = np.median(edge_samples, axis=0)
    diff = np.sqrt(np.sum((lab - base_color) ** 2, axis=-1))
    mask = (diff > tolerance).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    return cv2.GaussianBlur(mask, (3, 3), 0)


def process_print_extraction(image_bytes: bytes, job: dict[str, Any]) -> dict[str, Any]:
    job_options = job.get("options", {})
    options = job_options.get("options", {})
    max_size = int(options.get("maxSize") or 1800)
    tolerance = int(options.get("tolerance") or PRINT_TOLERANCE)
    image = load_image(image_bytes, max_size)
    rgb = np.array(image.convert("RGB"))
    asset_id = job.get("asset", {}).get("id")
    manual_rects = job_options.get("manual_rects") if isinstance(job_options.get("manual_rects"), dict) else {}
    rect = clamp_rect(parse_rect(manual_rects.get(asset_id)) or {"height": image.height, "width": image.width, "x": 0, "y": 0}, image.width, image.height)

    x, y, width, height = rect["x"], rect["y"], rect["width"], rect["height"]
    region = rgb[y : y + height, x : x + width]
    mask = extract_print_mask(region, tolerance)
    rgba = np.dstack([region, mask])
    result = Image.fromarray(rgba, "RGBA")

    return {
        "bbox": rect,
        "height": result.height,
        "mask": to_png_bytes(Image.fromarray(mask, "L")),
        "metrics": {
            "source": "local_worker_opencv",
            "tolerance": tolerance,
        },
        "output": to_png_bytes(result),
        "preview": to_preview_jpg(result),
        "raw": to_png_bytes(result),
        "width": result.width,
    }


def make_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {LOCAL_WORKER_SECRET}"}


def download_image(client: httpx.Client, url: str) -> bytes:
    with client.stream("GET", url) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
        if not content_type.startswith("image/"):
            raise RuntimeError("任务图片地址返回的不是图片内容")

        chunks: list[bytes] = []
        downloaded = 0
        max_size = MAX_IMAGE_SIZE_MB * 1024 * 1024
        for chunk in response.iter_bytes():
            if not chunk:
                continue
            downloaded += len(chunk)
            if downloaded > max_size:
                raise RuntimeError(f"图片过大，超过 {MAX_IMAGE_SIZE_MB}MB")
            chunks.append(chunk)

    if not chunks:
        raise RuntimeError("任务图片内容为空")

    return b"".join(chunks)


def claim_job(client: httpx.Client) -> dict[str, Any] | None:
    response = client.post(
        f"{POD_API_URL}/api/local-worker/jobs/claim",
        headers=make_headers(),
        json={
            "jobTypes": LOCAL_WORKER_JOB_TYPES,
            "workerId": LOCAL_WORKER_ID,
        },
    )
    response.raise_for_status()
    data = response.json()
    return data.get("job")


def complete_job(client: httpx.Client, job: dict[str, Any], result: dict[str, Any]) -> None:
    item_id = job["item_id"]
    data = {
        "bbox": json.dumps(result.get("bbox", {}), ensure_ascii=False),
        "height": str(result.get("height") or ""),
        "metrics": json.dumps(result.get("metrics", {}), ensure_ascii=False),
        "width": str(result.get("width") or ""),
    }
    files = {
        "output": ("output.png", result["output"], "image/png"),
        "preview": ("preview.jpg", result["preview"], "image/jpeg"),
        "mask": ("mask.png", result["mask"], "image/png"),
    }

    if result.get("raw"):
        files["raw"] = ("raw.png", result["raw"], "image/png")

    response = client.post(
        f"{POD_API_URL}/api/local-worker/jobs/{item_id}/complete",
        headers=make_headers(),
        data=data,
        files=files,
    )
    response.raise_for_status()


def fail_job(client: httpx.Client, job: dict[str, Any], error: Exception) -> None:
    item_id = job["item_id"]
    response = client.post(
        f"{POD_API_URL}/api/local-worker/jobs/{item_id}/fail",
        headers=make_headers(),
        json={"error": str(error)},
    )
    response.raise_for_status()


def process_job(client: httpx.Client, job: dict[str, Any]) -> None:
    print(f"领取任务：{job['job_type']} / {job['item_id']}", flush=True)
    image_bytes = download_image(client, job["input_url"])

    if job["job_type"] == "cutout":
        result = process_cutout(image_bytes, job)
    elif job["job_type"] == "print_extraction":
        result = process_print_extraction(image_bytes, job)
    else:
        raise RuntimeError(f"不支持的任务类型：{job['job_type']}")

    complete_job(client, job, result)
    print(f"任务完成：{job['item_id']}", flush=True)


def main() -> None:
    require_config()
    timeout = httpx.Timeout(REQUEST_TIMEOUT_SECONDS)
    print(f"本地 worker 已启动：{LOCAL_WORKER_ID}", flush=True)
    print(f"POD_API_URL={POD_API_URL}", flush=True)
    print(f"任务类型={','.join(LOCAL_WORKER_JOB_TYPES)}", flush=True)

    with httpx.Client(timeout=timeout, follow_redirects=True, trust_env=False) as client:
        while True:
            job = claim_job(client)
            if not job:
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            try:
                process_job(client, job)
            except Exception as exc:
                print(f"任务失败：{exc}", flush=True)
                try:
                    fail_job(client, job, exc)
                except Exception as fail_exc:
                    print(f"失败状态回写失败：{fail_exc}", flush=True)


if __name__ == "__main__":
    main()
