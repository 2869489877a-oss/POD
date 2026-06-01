"""AI 生图客户端，用于润色优化印花图片。支持通义万相和豆包。"""

import base64
import io
import os
import time
from pathlib import Path

import httpx

_PROVIDER = os.getenv("AI_IMAGE_PROVIDER", "tongyi").strip()
_TIMEOUT = 120


def _load_env():
    env_path = Path(__file__).resolve().parent / "ai-processor.env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env()


def _get_tongyi_config():
    api_key = os.getenv("TONGYI_IMAGE_API_KEY", os.getenv("QWEN_VL_API_KEY", "")).strip()
    if not api_key:
        raise ValueError("缺少环境变量 TONGYI_IMAGE_API_KEY 或 QWEN_VL_API_KEY")
    base_url = os.getenv("TONGYI_IMAGE_BASE_URL", "https://dashscope.aliyuncs.com").strip().rstrip("/")
    model = os.getenv("TONGYI_IMAGE_MODEL", "wanx-v1").strip()
    return api_key, base_url, model


def _get_doubao_config():
    api_key = os.getenv("DOUBAO_IMAGE_API_KEY", "").strip()
    if not api_key:
        raise ValueError("缺少环境变量 DOUBAO_IMAGE_API_KEY")
    base_url = os.getenv("DOUBAO_IMAGE_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        raise ValueError("缺少环境变量 DOUBAO_IMAGE_BASE_URL")
    model = os.getenv("DOUBAO_IMAGE_MODEL", "").strip()
    if not model:
        raise ValueError("缺少环境变量 DOUBAO_IMAGE_MODEL")
    return api_key, base_url, model


def _polish_with_tongyi(image_bytes: bytes, prompt: str) -> bytes:
    """通义万相图片编辑/生成。"""
    api_key, base_url, model = _get_tongyi_config()
    image_b64 = base64.b64encode(image_bytes).decode()

    submit_url = f"{base_url}/api/v1/services/aigc/image2image/image-synthesis"
    body = {
        "model": model,
        "input": {
            "prompt": prompt,
            "base_image_url": f"data:image/png;base64,{image_b64}",
        },
        "parameters": {
            "style": "<auto>",
        },
    }

    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(
            submit_url,
            json=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"通义万相提交失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    task_id = data.get("output", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"通义万相未返回 task_id: {data}")

    return _poll_tongyi_task(api_key, base_url, task_id)


def _poll_tongyi_task(api_key: str, base_url: str, task_id: str) -> bytes:
    """轮询通义万相任务直到完成。"""
    status_url = f"{base_url}/api/v1/tasks/{task_id}"
    max_attempts = 60

    for _ in range(max_attempts):
        time.sleep(2)
        with httpx.Client(timeout=30) as client:
            resp = client.get(status_url, headers={"Authorization": f"Bearer {api_key}"})

        if resp.status_code != 200:
            raise RuntimeError(f"通义万相查询失败 ({resp.status_code})")

        data = resp.json()
        status = data.get("output", {}).get("task_status")

        if status == "SUCCEEDED":
            results = data.get("output", {}).get("results", [])
            first = results[0] if results else {}

            if first.get("b64_image"):
                return base64.b64decode(first["b64_image"])

            if first.get("url"):
                with httpx.Client(timeout=30) as client:
                    img_resp = client.get(first["url"])
                if img_resp.status_code == 200:
                    return img_resp.content
                raise RuntimeError("通义万相图片下载失败")

            raise RuntimeError("通义万相未返回图片")

        if status == "FAILED":
            msg = data.get("output", {}).get("message", "未知错误")
            raise RuntimeError(f"通义万相生成失败: {msg}")

    raise RuntimeError("通义万相生成超时")


def _polish_with_doubao(image_bytes: bytes, prompt: str) -> bytes:
    """豆包图片编辑/生成。"""
    api_key, base_url, model = _get_doubao_config()
    image_b64 = base64.b64encode(image_bytes).decode()

    url = f"{base_url}/v1/images/edits"
    body = {
        "model": model,
        "prompt": prompt,
        "image": image_b64,
        "n": 1,
        "response_format": "b64_json",
    }

    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(
            url,
            json=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"豆包 API 失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    image_data = data.get("data", [{}])[0].get("b64_json")
    if not image_data:
        raise RuntimeError("豆包未返回图片数据")

    return base64.b64decode(image_data)


def polish_image(image_bytes: bytes, prompt: str) -> bytes:
    """根据配置的 provider 调用 AI 生图润色。"""
    provider = _PROVIDER.lower()
    if provider == "doubao":
        return _polish_with_doubao(image_bytes, prompt)
    return _polish_with_tongyi(image_bytes, prompt)
