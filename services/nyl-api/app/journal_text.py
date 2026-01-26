from typing import Any


def _append_text(chunks: list[str], text: str) -> None:
    if text:
        chunks.append(text)


def _maybe_newline(chunks: list[str]) -> None:
    if not chunks:
        return
    if not chunks[-1].endswith("\n"):
        chunks.append("\n")


def _walk_tiptap(node: dict[str, Any], chunks: list[str]) -> None:
    node_type = node.get("type")
    if node_type == "text":
        _append_text(chunks, node.get("text", ""))
        return
    if node_type == "hardBreak":
        chunks.append("\n")
        return

    for child in node.get("content", []) or []:
        _walk_tiptap(child, chunks)

    if node_type in {
        "paragraph",
        "heading",
        "blockquote",
        "codeBlock",
        "listItem",
    }:
        _maybe_newline(chunks)


def extract_journal_text(body: dict[str, Any] | None) -> str:
    if not body or not isinstance(body, dict):
        return ""
    chunks: list[str] = []
    _walk_tiptap(body, chunks)
    text = "".join(chunks)
    return "\n".join(line.rstrip() for line in text.splitlines()).strip()
