import os

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .ollama import chat, get_ollama_client, list_models, stream_chat
from .schemas import ChatRequest

app = FastAPI(title="Nyl API")

cors_origins = [origin.strip() for origin in os.getenv("CORS_ALLOW_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    allow_all = "*" in cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else cors_origins,
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )


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
