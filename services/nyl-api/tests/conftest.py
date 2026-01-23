import sys
from pathlib import Path

import pytest

import app.main as main
from app.main import app

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def disable_db_lifecycle(monkeypatch):
    async def noop():
        return None

    monkeypatch.setattr(main, "startup_db", noop)
    monkeypatch.setattr(main, "shutdown_db", noop)
    app.router.on_startup.clear()
    app.router.on_shutdown.clear()
    yield
