from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from astergrid.config import Settings
from astergrid.main import create_app
from astergrid.presets import PRESETS


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        data_dir=tmp_path,
        frontend_dir=tmp_path / "missing-frontend",
        run_timeout_seconds=90,
        cors_origins="http://testserver",
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


def scenario_payload(preset_index: int = 0) -> dict:
    return PRESETS[preset_index].scenario.model_dump(mode="json")


def parse_sse(body: str) -> list[dict]:
    events: list[dict] = []
    for line in body.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


def test_health_meta_and_presets(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    meta = client.get("/api/meta").json()
    assert meta["product"] == "ASTERGRID"
    assert meta["execution_mode"] == "deterministic"
    assert meta["gemini_configured"] is False
    assert meta["max_revisions"] == 2
    assert len(meta["world_presets"]) == 4

    presets = client.get("/api/presets").json()
    assert [preset["id"] for preset in presets] == [
        "riverbend",
        "cedar_ridge",
        "arclight",
        "meridian",
    ]
    agents = client.get("/api/agents").json()
    assert len(agents) >= 9
    assert all("depends_on" in agent for agent in agents)


def test_analysis_run_stream_bundle_and_report(client: TestClient) -> None:
    scenario = scenario_payload()
    preview = client.post("/api/preview", json=scenario)
    assert preview.status_code == 200
    preview_data = preview.json()
    assert preview_data["draft"] is True
    preview_hash = preview_data["world"]["hash"]

    created = client.post(f"/api/runs?preview_world_hash={preview_hash}", json=scenario)
    assert created.status_code == 201, created.text
    run_id = created.json()["run_id"]

    stream = client.get(f"/api/runs/{run_id}/stream?after=0")
    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    streamed = parse_sse(stream.text)
    assert streamed
    assert streamed[0]["type"] == "run.queued"
    assert streamed[-1]["type"] in {"run.completed", "run.needs_attention"}
    assert any(event["type"] == "join.completed" for event in streamed)
    assert any(event["type"] == "verification.finding" for event in streamed)

    record = None
    for _ in range(80):
        record = client.get(f"/api/runs/{run_id}").json()
        if record["status"] in {"completed", "needs_attention", "failed", "cancelled"}:
            break
        time.sleep(0.1)
    assert record is not None
    assert record["status"] == "completed"
    assert record["has_report"] is True
    assert record["revision_count"] >= 1
    assert record["model_calls"] == 0
    assert record["world_hash"] == preview_hash
    assert record["manifest"]["effective_mode"] == "deterministic"
    assert record["manifest"]["algorithm_versions"]["simulation"] == "1.0"

    events = client.get(f"/api/runs/{run_id}/events").json()
    assert len(events) == len(streamed)
    assert [event["seq"] for event in events] == list(range(1, len(events) + 1))
    replayed = client.get(f"/api/runs/{run_id}/events?after=5&limit=3").json()
    assert [event["seq"] for event in replayed] == [6, 7, 8]

    bundle = client.get(f"/api/runs/{run_id}/bundle").json()
    assert bundle["run"]["id"] == run_id
    assert bundle["artifacts"]["world"]["hash"] == preview_hash
    assert bundle["artifacts"]["report"]["metrics"]["unmet_demand"] == 0
    assert bundle["report"]["metrics"]["coverage_pct"] == 100.0
    assert bundle["report"]["model_calls"] == 0
    assert bundle["report"]["execution_mode"] == "deterministic"
    assert any(finding["code"] == "ROUTE_BLOCKED" for finding in bundle["report"]["findings"])
    assert "ASTERGRID Run Report" in bundle["report_markdown"]

    report = client.get(f"/api/runs/{run_id}/report")
    assert report.status_code == 200
    assert report.json()["markdown"] == bundle["report_markdown"]
    markdown = client.get(f"/api/runs/{run_id}/report.md")
    assert markdown.status_code == 200
    assert "attachment" in markdown.headers["content-disposition"]
    assert "ROUTE_BLOCKED" in markdown.text


def test_api_validation_and_honest_gemini_gate(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    bad = scenario_payload()
    bad["affected_district_ids"] = ["D-99"]
    response = client.post("/api/preview", json=bad)
    assert response.status_code == 422
    assert response.json()["code"] == "UNKNOWN_DISTRICT"

    gemini = scenario_payload()
    gemini["execution_mode"] = "gemini"
    response = client.post("/api/runs", json=gemini)
    assert response.status_code == 422
    assert response.json()["code"] == "GEMINI_NOT_CONFIGURED"

    missing = client.get("/api/runs/run_does_not_exist")
    assert missing.status_code == 404
    assert missing.json()["code"] == "RUN_NOT_FOUND"

    invalid = client.post("/api/preview", json={"unexpected_field": True})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "VALIDATION_ERROR"

    empty = scenario_payload()
    empty["affected_district_ids"] = []
    response = client.post("/api/preview", json=empty)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"

    oversized = scenario_payload()
    oversized["name"] = "x" * 300_000
    response = client.post("/api/preview", json=oversized)
    assert response.status_code == 413
    assert response.json()["code"] == "PAYLOAD_TOO_LARGE"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_security_headers_are_applied_to_api_responses(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.headers["content-security-policy"].startswith("default-src 'self'")
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
