from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class RagConfig(BaseModel):
    enabled: bool = False
    source: str | None = None
    top_k: int | None = Field(default=None, ge=1)


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    stream: bool = True
    rag: RagConfig | None = None

