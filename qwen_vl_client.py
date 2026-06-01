"""通义千问 VL 视觉模型客户端，兼容 OpenAI Chat Completions 格式。"""

import base64
import json
import os
import re
from pathlib import Path

import httpx

_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
_DEFAULT_MODEL = "qwen-vl-max"
_TIMEOUT = 60


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


def _get_config():
    api_key = os.getenv("QWEN_VL_API_KEY", "").strip()
    if not api_key:
        raise ValueError("缺少环境变量 QWEN_VL_API_KEY")
    base_url = os.getenv("QWEN_VL_BASE_URL", _DEFAULT_BASE_URL).strip().rstrip("/")
    model = os.getenv("QWEN_VL_MODEL", _DEFAULT_MODEL).strip()
    return api_key, base_url, model


def _ensure_chat_completions_url(base_url: str) -> str:
    if base_url.endswith("/chat/completions"):
        return base_url
    return f"{base_url}/chat/completions"


def _encode_image(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")


def call_vision(prompt: str, image_bytes: bytes, extra_image_bytes: bytes | None = None) -> str:
    """调用通义千问 VL，发送图片+文本，返回模型文本回复。"""
    api_key, base_url, model = _get_config()
    url = _ensure_chat_completions_url(base_url)

    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{_encode_image(image_bytes)}"}},
    ]
    if extra_image_bytes:
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{_encode_image(extra_image_bytes)}"}}
        )
    content.append({"type": "text", "text": prompt})

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.2,
    }

    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"通义千问 VL 请求失败 ({resp.status_code}): {resp.text[:500]}")

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("通义千问 VL 未返回有效内容")

    message = choices[0].get("message", {})
    text = message.get("content", "")
    if isinstance(text, list):
        text = "".join(part.get("text", "") for part in text if isinstance(part, dict))
    return text.strip()


def call_vision_json(prompt: str, image_bytes: bytes, extra_image_bytes: bytes | None = None) -> dict:
    """调用通义千问 VL 并解析返回的 JSON。"""
    raw = call_vision(prompt, image_bytes, extra_image_bytes)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    json_str = match.group(1).strip() if match else raw.strip()
    if json_str.startswith("{"):
        pass
    else:
        start = json_str.find("{")
        if start >= 0:
            json_str = json_str[start:]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"AI 返回内容无法解析为 JSON: {e}\n原始内容: {raw[:300]}") from e
