import json
import os
from collections.abc import AsyncGenerator
from typing import Any
from uuid import uuid4

import httpx
from fastapi import Depends, HTTPException

from .schemas import ChatRequest

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "30"))
_ollama_client: httpx.AsyncClient | None = None


def _ollama_timeout() -> httpx.Timeout:
    return httpx.Timeout(
        connect=OLLAMA_TIMEOUT,
        read=None,
        write=OLLAMA_TIMEOUT,
        pool=OLLAMA_TIMEOUT,
    )


async def startup_ollama_client() -> None:
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = httpx.AsyncClient(base_url=OLLAMA_BASE_URL, timeout=_ollama_timeout())


async def shutdown_ollama_client() -> None:
    global _ollama_client
    if _ollama_client is not None:
        await _ollama_client.aclose()
        _ollama_client = None


def get_ollama_client() -> httpx.AsyncClient:
    if _ollama_client is None:
        raise RuntimeError("Ollama client is not initialized")
    return _ollama_client


async def list_models(client: httpx.AsyncClient = Depends(get_ollama_client)) -> dict[str, Any]:
    response = await client.get("/api/tags")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Ollama tags request failed")
    payload = response.json()
    models = [
        {
            "id": model.get("name"),
            "name": model.get("name"),
            "size": model.get("size"),
            "modified_at": model.get("modified_at"),
        }
        for model in payload.get("models", [])
    ]
    return {"models": models}


def _build_chunk(delta: dict[str, Any], chunk_id: str) -> str:
    payload = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "choices": [{"index": 0, "delta": delta}],
    }
    return f"data: {json.dumps(payload)}\n\n"


async def stream_chat(
    request: ChatRequest,
    client: httpx.AsyncClient = Depends(get_ollama_client),
) -> AsyncGenerator[bytes, None]:
    payload = {
        "model": request.model,
        "messages": [message.model_dump() for message in request.messages],
        "stream": True,
    }

    async with client.stream("POST", "/api/chat", json=payload) as response:
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Ollama chat request failed")

        chunk_id = f"chatcmpl-{uuid4().hex}"
        role_sent = False

        async for line in response.aiter_lines():
            if not line:
                continue

            data = json.loads(line)
            if data.get("error"):
                raise HTTPException(status_code=502, detail=data["error"])

            message = data.get("message") or {}
            content = message.get("content") or ""
            delta: dict[str, Any] = {}

            if not role_sent:
                delta["role"] = message.get("role", "assistant")
                role_sent = True

            if content:
                delta["content"] = content

            if delta:
                yield _build_chunk(delta, chunk_id).encode("utf-8")

            if data.get("done") is True:
                break

    yield b"data: [DONE]\n\n"


async def chat(
    request: ChatRequest,
    client: httpx.AsyncClient = Depends(get_ollama_client),
) -> dict[str, Any]:
    payload = {
        "model": request.model,
        "messages": [message.model_dump() for message in request.messages],
        "stream": False,
    }

    response = await client.post("/api/chat", json=payload)
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Ollama chat request failed")

    data = response.json()
    message = data.get("message") or {}
    content = message.get("content") or ""

    return {
        "id": f"chatcmpl-{uuid4().hex}",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": message.get("role", "assistant"),
                    "content": content,
                },
            }
        ],
    }
