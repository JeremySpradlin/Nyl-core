import json

import httpx
import pytest
from fastapi import HTTPException

from app.main import app
from app.ollama import chat, stream_chat
from app.schemas import ChatRequest
from tests.utils import OllamaStream, app_client, build_mock_transport


@pytest.mark.asyncio
async def test_chat_stream_basic():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        payload = json.loads(request.content)
        assert payload["stream"] is True
        stream = OllamaStream(
            [
                {"message": {"role": "assistant", "content": "Hello"}, "done": False},
                {"message": {"role": "assistant", "content": " there"}, "done": False},
                {"message": {"role": "assistant", "content": ""}, "done": True},
            ]
        )
        return httpx.Response(200, stream=stream)

    transport = build_mock_transport(handler)
    request = ChatRequest(
        model="llama3.1:8b",
        messages=[{"role": "user", "content": "hi"}],
        stream=True,
    )

    chunks = []
    async with httpx.AsyncClient(transport=transport, base_url="http://ollama") as async_client:
        async for chunk in stream_chat(request, async_client):
            chunks.append(chunk.decode())

    assert chunks[0].startswith("data: {")
    assert "\"role\": \"assistant\"" in chunks[0]
    assert any("Hello" in chunk for chunk in chunks)
    assert chunks[-1] == "data: [DONE]\n\n"


@pytest.mark.asyncio
async def test_chat_endpoint_stream():
    def handler(request: httpx.Request) -> httpx.Response:
        stream = OllamaStream(
            [
                {"message": {"role": "assistant", "content": "Hello"}, "done": False},
                {"message": {"role": "assistant", "content": " there"}, "done": False},
                {"message": {"role": "assistant", "content": ""}, "done": True},
            ]
        )
        return httpx.Response(200, stream=stream)

    transport = build_mock_transport(handler)
    payload = {
        "model": "llama3.1:8b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": True,
    }

    async with app_client(transport) as client:
        async with client.stream("POST", "/v1/chat/completions", json=payload) as response:
            assert response.status_code == 200
            chunks = [line async for line in response.aiter_lines() if line]

    assert chunks[0].startswith("data: {")
    assert any("Hello" in chunk for chunk in chunks)
    assert chunks[-1] == "data: [DONE]"


@pytest.mark.asyncio
async def test_chat_non_stream():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["stream"] is False
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": "Hello"}},
        )

    transport = build_mock_transport(handler)
    request = ChatRequest(
        model="llama3.1:8b",
        messages=[{"role": "user", "content": "hi"}],
        stream=False,
    )

    async with httpx.AsyncClient(transport=transport, base_url="http://ollama") as async_client:
        data = await chat(request, async_client)

    assert data["choices"][0]["message"]["content"] == "Hello"


@pytest.mark.asyncio
async def test_chat_endpoint_non_stream():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["stream"] is False
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": "Hello"}},
        )

    transport = build_mock_transport(handler)
    payload = {
        "model": "llama3.1:8b",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": False,
    }

    async with app_client(transport) as client:
        response = await client.post("/v1/chat/completions", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["choices"][0]["message"]["content"] == "Hello"

@pytest.mark.asyncio
async def test_chat_invalid_payload():
    transport = build_mock_transport(lambda request: httpx.Response(500))
    async with app_client(transport) as client:
        response = await client.post("/v1/chat/completions", json={"stream": True})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ollama_error_passthrough():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    transport = build_mock_transport(handler)
    request = ChatRequest(
        model="llama3.1:8b",
        messages=[{"role": "user", "content": "hi"}],
        stream=False,
    )

    async with httpx.AsyncClient(transport=transport, base_url="http://ollama") as async_client:
        with pytest.raises(HTTPException) as exc_info:
            await chat(request, async_client)

    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_rag_placeholder_does_not_break():
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert "rag" not in payload
        return httpx.Response(
            200,
            json={"message": {"role": "assistant", "content": "Hello"}},
        )

    transport = build_mock_transport(handler)
    request = ChatRequest(
        model="llama3.1:8b",
        messages=[{"role": "user", "content": "hi"}],
        stream=False,
        rag={"enabled": True, "source": "trilium", "top_k": 3},
    )

    async with httpx.AsyncClient(transport=transport, base_url="http://ollama") as async_client:
        data = await chat(request, async_client)

    assert data["choices"][0]["message"]["content"] == "Hello"
