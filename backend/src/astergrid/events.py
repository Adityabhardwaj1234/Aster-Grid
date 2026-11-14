from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from datetime import UTC, datetime
from typing import Any

from .models import RunEvent
from .store import Store


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class EventBus:
    """One ordered writer per run; live subscribers get a best-effort queue.

    Persistence happens before broadcast. A subscriber can reconnect with the
    last seen sequence and replay from SQLite without losing the authoritative
    order.
    """

    def __init__(self, store: Store, run_id: str, initial_seq: int = 0) -> None:
        self.store = store
        self.run_id = run_id
        self.seq = initial_seq
        self._lock = asyncio.Lock()
        self._subscribers: set[asyncio.Queue[RunEvent | None]] = set()
        self._closed = False

    async def emit(
        self,
        event_type: str,
        *,
        agent_id: str | None = None,
        status: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> RunEvent:
        async with self._lock:
            if self._closed:
                return RunEvent(
                    event_id=f"{self.run_id}:{self.seq}",
                    run_id=self.run_id,
                    seq=self.seq,
                    type=event_type,
                    ts=utc_now(),
                    agent_id=agent_id,
                    status=status,
                    payload=payload or {},
                )
            self.seq += 1
            event = RunEvent(
                event_id=f"{self.run_id}:{self.seq}",
                run_id=self.run_id,
                seq=self.seq,
                type=event_type,
                ts=utc_now(),
                agent_id=agent_id,
                status=status,
                payload=_json_safe(payload or {}),
            )
            await self.store.append_event(event)
        for queue in list(self._subscribers):
            _put_best_effort(queue, event)
        return event

    def subscribe(self) -> asyncio.Queue[RunEvent | None]:
        queue: asyncio.Queue[RunEvent | None] = asyncio.Queue(maxsize=512)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[RunEvent | None]) -> None:
        self._subscribers.discard(queue)

    @property
    def closed(self) -> bool:
        return self._closed

    async def close(self) -> None:
        async with self._lock:
            if self._closed:
                return
            self._closed = True
        for queue in list(self._subscribers):
            _put_best_effort(queue, None)
        self._subscribers.clear()


def _json_safe(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except (TypeError, ValueError):
        return {"unserializable": True, "repr": repr(value)}


def _put_best_effort(queue: asyncio.Queue[RunEvent | None], value: RunEvent | None) -> None:
    try:
        queue.put_nowait(value)
    except asyncio.QueueFull:
        with suppress(asyncio.QueueEmpty):
            queue.get_nowait()
        with suppress(asyncio.QueueFull):
            queue.put_nowait(value)
