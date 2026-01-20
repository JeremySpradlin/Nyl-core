.PHONY: run test smoke

OLLAMA_BASE_URL ?= http://ollama:11434
VENV_BIN := .venv/bin

run:
	OLLAMA_BASE_URL=$(OLLAMA_BASE_URL) $(VENV_BIN)/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	$(VENV_BIN)/pytest

smoke:
	curl -sS http://localhost:8000/health
	curl -sS http://localhost:8000/v1/models
	curl -N http://localhost:8000/v1/chat/completions \
		-H "Content-Type: application/json" \
		-d '{"model":"llama3.1:8b","messages":[{"role":"user","content":"hello"}],"stream":true}'
