from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def default_data_dir() -> Path:
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base) / "ASTERGRID"
    return Path.home() / ".astergrid"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ASTERGRID_",
        env_file=".env",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = default_data_dir()
    execution_mode: str = "deterministic"
    max_revisions: int = 2
    run_timeout_seconds: float = 120.0
    runs_retention: int = 20
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    gemini_model: str = "gemini-2.5-flash"
    frontend_dir: Path | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def database_path(self) -> Path:
        return self.data_dir / "astergrid.db"

    @property
    def resolved_frontend_dir(self) -> Path:
        if self.frontend_dir is not None:
            return self.frontend_dir
        return Path(__file__).resolve().parents[3] / "frontend" / "dist"


settings = Settings()
