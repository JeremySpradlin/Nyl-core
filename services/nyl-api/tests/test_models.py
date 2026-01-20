import httpx
import pytest

from app.ollama import list_models
from tests.utils import build_mock_transport


@pytest.mark.asyncio
async def test_list_models():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(
            200,
            json={
                "models": [
                    {
                        "name": "llama3.1:8b",
                        "size": 123,
                        "modified_at": "2024-01-01T00:00:00Z",
                    }
                ]
            },
        )

    transport = build_mock_transport(handler)
    async with httpx.AsyncClient(transport=transport, base_url="http://ollama") as async_client:
        data = await list_models(async_client)

    assert data["models"][0]["id"] == "llama3.1:8b"
