import httpx
from fastapi import Depends, FastAPI
from fastapi.responses import StreamingResponse

from .ollama import chat, get_ollama_client, list_models, stream_chat
from .schemas import ChatRequest

app = FastAPI(title="Nyl API")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/models")
async def models(client: httpx.AsyncClient = Depends(get_ollama_client)) -> dict[str, object]:
    return await list_models(client)


@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatRequest,
    client: httpx.AsyncClient = Depends(get_ollama_client),
):
    if request.stream:
        return StreamingResponse(
            stream_chat(request, client),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )
    return await chat(request, client)
