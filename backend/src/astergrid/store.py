from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aiosqlite

from .models import RunEvent, RunManifest, RunRecord

SCHEMA_VERSION = 1


def _now() -> str:
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._db: aiosqlite.Connection | None = None
        self._write_lock = asyncio.Lock()

    async def connect(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(self.path)
        self._db.row_factory = aiosqlite.Row
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA foreign_keys=ON")
        await self._db.execute("PRAGMA busy_timeout=5000")
        await self._init_schema()

    async def _init_schema(self) -> None:
        assert self._db is not None
        await self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS schema_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                scenario_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                effective_mode TEXT NOT NULL,
                current_agent TEXT,
                revision_count INTEGER NOT NULL DEFAULT 0,
                model_calls INTEGER NOT NULL DEFAULT 0,
                world_hash TEXT NOT NULL DEFAULT '',
                result_hash TEXT NOT NULL DEFAULT '',
                error TEXT,
                manifest_json TEXT,
                has_report INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS events (
                run_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                event_id TEXT NOT NULL,
                type TEXT NOT NULL,
                ts TEXT NOT NULL,
                agent_id TEXT,
                status TEXT,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (run_id, seq),
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS artifacts (
                run_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                artifact_id TEXT NOT NULL,
                hash TEXT NOT NULL,
                json TEXT NOT NULL,
                PRIMARY KEY (run_id, kind),
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS snapshots (
                run_id TEXT NOT NULL,
                tick INTEGER NOT NULL,
                sim_time_min INTEGER NOT NULL,
                json TEXT NOT NULL,
                PRIMARY KEY (run_id, tick),
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS reports (
                run_id TEXT PRIMARY KEY,
                json TEXT NOT NULL,
                markdown TEXT NOT NULL,
                FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events(run_id, seq);
            CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
            """
        )
        await self._db.execute(
            "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', ?)",
            (str(SCHEMA_VERSION),),
        )
        await self._db.commit()

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        if self._db is None:
            raise RuntimeError("store is not connected")
        return self._db

    # --- Runs ---------------------------------------------------------------
    async def create_run(self, record: RunRecord) -> None:
        async with self._write_lock:
            await self.db.execute(
                """
                INSERT INTO runs(
                    id, status, scenario_json, created_at, updated_at,
                    effective_mode, current_agent, revision_count, model_calls,
                    world_hash, result_hash, error, manifest_json, has_report
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    record.id,
                    record.status,
                    record.scenario.model_dump_json(),
                    record.created_at,
                    record.updated_at,
                    record.effective_mode,
                    record.current_agent,
                    record.revision_count,
                    record.model_calls,
                    record.world_hash,
                    record.result_hash,
                    record.error,
                    record.manifest.model_dump_json() if record.manifest else None,
                    int(record.has_report),
                ),
            )
            await self.db.commit()

    async def update_run(self, run_id: str, **fields: Any) -> None:
        allowed = {
            "status",
            "effective_mode",
            "current_agent",
            "revision_count",
            "model_calls",
            "world_hash",
            "result_hash",
            "error",
            "manifest",
            "has_report",
        }
        updates: list[str] = []
        values: list[Any] = []
        for key, value in fields.items():
            if key not in allowed:
                continue
            if key == "manifest":
                updates.append("manifest_json = ?")
                values.append(value.model_dump_json() if value is not None else None)
            elif key == "has_report":
                updates.append("has_report = ?")
                values.append(int(bool(value)))
            else:
                updates.append(f"{key} = ?")
                values.append(value)
        updates.append("updated_at = ?")
        values.append(_now())
        values.append(run_id)
        async with self._write_lock:
            await self.db.execute(f"UPDATE runs SET {', '.join(updates)} WHERE id = ?", values)
            await self.db.commit()

    def _run_from_row(self, row: aiosqlite.Row) -> RunRecord:
        scenario = json.loads(row["scenario_json"])
        manifest = (
            RunManifest.model_validate(json.loads(row["manifest_json"]))
            if row["manifest_json"]
            else None
        )
        return RunRecord(
            id=row["id"],
            status=row["status"],
            scenario=scenario,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            effective_mode=row["effective_mode"],
            current_agent=row["current_agent"],
            revision_count=row["revision_count"],
            model_calls=row["model_calls"],
            world_hash=row["world_hash"],
            result_hash=row["result_hash"],
            error=row["error"],
            manifest=manifest,
            has_report=bool(row["has_report"]),
        )

    async def get_run(self, run_id: str) -> RunRecord | None:
        async with self.db.execute("SELECT * FROM runs WHERE id = ?", (run_id,)) as cursor:
            row = await cursor.fetchone()
        return self._run_from_row(row) if row else None

    async def list_runs(self, limit: int = 20) -> list[RunRecord]:
        async with self.db.execute(
            "SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
        return [self._run_from_row(row) for row in rows]

    async def max_event_seq(self, run_id: str) -> int:
        async with self.db.execute(
            "SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE run_id = ?", (run_id,)
        ) as cursor:
            row = await cursor.fetchone()
        return int(row["seq"]) if row else 0

    async def mark_orphaned(self) -> list[str]:
        """Mark runs left running by a restart as interrupted; do not delete evidence."""

        interrupted: list[str] = []
        async with self.db.execute(
            "SELECT id FROM runs WHERE status IN ('queued', 'running')"
        ) as cursor:
            rows = await cursor.fetchall()
        for row in rows:
            run_id = row["id"]
            interrupted.append(run_id)
            seq = await self.max_event_seq(run_id) + 1
            await self.db.execute(
                "UPDATE runs SET status = 'interrupted', error = ?, updated_at = ? WHERE id = ?",
                ("Server restarted before this run completed.", _now(), run_id),
            )
            await self.db.execute(
                """
                INSERT OR IGNORE INTO events(run_id, seq, event_id, type, ts, agent_id, status, payload_json)
                VALUES(?,?,?,?,?,?,?,?)
                """,
                (
                    run_id,
                    seq,
                    f"{run_id}:{seq}",
                    "run.failed",
                    _now(),
                    "director",
                    "interrupted",
                    json.dumps(
                        {
                            "code": "SERVER_RESTART",
                            "message": "Server restarted before this run completed.",
                        }
                    ),
                ),
            )
        async with self._write_lock:
            await self.db.commit()
        return interrupted

    # --- Events -------------------------------------------------------------
    async def append_event(self, event: RunEvent) -> None:
        async with self._write_lock:
            await self.db.execute(
                """
                INSERT INTO events(run_id, seq, event_id, type, ts, agent_id, status, payload_json)
                VALUES(?,?,?,?,?,?,?,?)
                """,
                (
                    event.run_id,
                    event.seq,
                    event.event_id,
                    event.type,
                    event.ts,
                    event.agent_id,
                    event.status,
                    json.dumps(event.payload, separators=(",", ":")),
                ),
            )
            await self.db.commit()

    def _event_from_row(self, row: aiosqlite.Row) -> RunEvent:
        return RunEvent(
            event_id=row["event_id"],
            run_id=row["run_id"],
            seq=row["seq"],
            type=row["type"],
            ts=row["ts"],
            agent_id=row["agent_id"],
            status=row["status"],
            payload=json.loads(row["payload_json"]),
        )

    async def get_events(
        self, run_id: str, after_seq: int = 0, limit: int = 1000
    ) -> list[RunEvent]:
        async with self.db.execute(
            "SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq LIMIT ?",
            (run_id, after_seq, limit),
        ) as cursor:
            rows = await cursor.fetchall()
        return [self._event_from_row(row) for row in rows]

    # --- Artifacts ----------------------------------------------------------
    async def save_artifact(self, run_id: str, kind: str, artifact: Any) -> None:
        payload = artifact.model_dump(mode="json") if hasattr(artifact, "model_dump") else artifact
        artifact_id = str(payload.get("id", kind)) if isinstance(payload, dict) else kind
        artifact_hash = str(payload.get("hash", "")) if isinstance(payload, dict) else ""
        async with self._write_lock:
            await self.db.execute(
                """
                INSERT INTO artifacts(run_id, kind, artifact_id, hash, json)
                VALUES(?,?,?,?,?)
                ON CONFLICT(run_id, kind) DO UPDATE SET
                    artifact_id = excluded.artifact_id,
                    hash = excluded.hash,
                    json = excluded.json
                """,
                (
                    run_id,
                    kind,
                    artifact_id,
                    artifact_hash,
                    json.dumps(payload, separators=(",", ":")),
                ),
            )
            await self.db.commit()

    async def get_artifact(self, run_id: str, kind: str) -> dict | None:
        async with self.db.execute(
            "SELECT json FROM artifacts WHERE run_id = ? AND kind = ?", (run_id, kind)
        ) as cursor:
            row = await cursor.fetchone()
        return json.loads(row["json"]) if row else None

    async def get_artifacts(self, run_id: str) -> dict[str, dict]:
        async with self.db.execute(
            "SELECT kind, json FROM artifacts WHERE run_id = ?", (run_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        return {row["kind"]: json.loads(row["json"]) for row in rows}

    async def save_report(self, run_id: str, report: Any, markdown: str) -> None:
        payload = report.model_dump(mode="json") if hasattr(report, "model_dump") else report
        async with self._write_lock:
            await self.db.execute(
                """
                INSERT INTO reports(run_id, json, markdown) VALUES(?,?,?)
                ON CONFLICT(run_id) DO UPDATE SET json = excluded.json, markdown = excluded.markdown
                """,
                (run_id, json.dumps(payload, separators=(",", ":")), markdown),
            )
            await self.db.execute(
                "UPDATE runs SET has_report = 1, updated_at = ? WHERE id = ?",
                (_now(), run_id),
            )
            await self.db.commit()

    async def get_report(self, run_id: str) -> dict | None:
        async with self.db.execute(
            "SELECT json, markdown FROM reports WHERE run_id = ?", (run_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if not row:
            return None
        return {"report": json.loads(row["json"]), "markdown": row["markdown"]}

    # --- Maintenance --------------------------------------------------------
    async def prune(self, keep: int = 20) -> int:
        async with self.db.execute(
            """
            SELECT id FROM runs
            WHERE status NOT IN ('queued', 'running')
            ORDER BY created_at DESC
            LIMIT -1 OFFSET ?
            """,
            (max(1, keep),),
        ) as cursor:
            rows = await cursor.fetchall()
        ids = [row["id"] for row in rows]
        if not ids:
            return 0
        placeholders = ",".join("?" for _ in ids)
        async with self._write_lock:
            for table in ("events", "artifacts", "snapshots", "reports", "runs"):
                column = "id" if table == "runs" else "run_id"
                await self.db.execute(
                    f"DELETE FROM {table} WHERE {column} IN ({placeholders})", ids
                )
            await self.db.commit()
        return len(ids)

    async def health(self) -> bool:
        try:
            async with self.db.execute("SELECT 1") as cursor:
                await cursor.fetchone()
            return True
        except Exception:
            return False
