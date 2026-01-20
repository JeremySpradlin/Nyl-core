import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

from app.main import app
from app.ollama import get_ollama_client

class OllamaStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[dict]):
        self._chunks = chunks

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield (json.dumps(chunk) + "\n").encode("utf-8")


def build_mock_transport(handler):
    return httpx.MockTransport(handler)


@asynccontextmanager
async def app_client(transport: httpx.MockTransport):
    async_client = httpx.AsyncClient(transport=transport, base_url="http://ollama")

    async def override_get_ollama_client():
        return async_client

    app.dependency_overrides[get_ollama_client] = override_get_ollama_client
    asgi_transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=asgi_transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        await async_client.aclose()
