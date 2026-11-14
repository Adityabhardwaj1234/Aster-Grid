# Architecture

## Overview

ASTERGRID is a local web application with a React/Three.js command center and a FastAPI backend that runs a per-scenario Google ADK workflow over deterministic domain services.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Browser                                                            │
│  Launch screen ─ Command center                                    │
│  React 19 + Three.js (R3F) + Zustand                               │
│      │ REST /api/*                  │ SSE /api/runs/{id}/stream    │
└──────┼──────────────────────────────┼──────────────────────────────┘
       │                              │
┌──────▼──────────────────────────────▼──────────────────────────────┐
│ FastAPI                                                            │
│  Routes ─ RunManager ─ EventBus ─ Store ─ SQLite                   │
│                │                                                   │
│                ▼                                                   │
│         Per-run ADK Workflow                                       │
│           intake → world → [conditions | resources | access]       │
│                → join → synchronize → preflight                    │
│                → [simulation | revision → preflight]               │
│                → outcome → [reporter → commit | revision]          │
│                │                                                   │
│                ▼                                                   │
│         Deterministic domain services                              │
│           worldgen · routing · allocation · simulation · verifier  │
└────────────────────────────────────────────────────────────────────┘
```

## Stack

### Backend

- Python 3.12
- FastAPI 0.141 + Uvicorn 0.54
- Google ADK 2.12 `Workflow` / `FunctionNode` / `JoinNode` / `InMemoryRunner`
- Pydantic 2 for API and artifact contracts, `pydantic-settings` for configuration
- NumPy for seeded world generation
- NetworkX for routing
- aiosqlite for local persistence
- Starlette `StreamingResponse` with `text/event-stream` for SSE (no `sse-starlette` dependency)

### Frontend

- React 19 + Vite 7 + TypeScript 5.9 strict mode
- Three.js 0.186 via `@react-three/fiber` 9 and `@react-three/drei` 10
- Zustand 5 for client state
- Zod 4 for draft validation
- CSS Modules plus a design-token layer
- No postprocessing package; visual effects are implemented with native Three.js materials and shaders

### Testing and tooling

- pytest 9, pytest-asyncio, httpx
- Vitest 4, Testing Library
- Playwright 1.64 with Chromium
- Ruff for Python lint and format
- Frontend verification is TypeScript `--noEmit`, Vitest, Vite build, and Playwright. No frontend linter is configured.

## Backend boundaries

The backend is a flat package at `backend/src/astergrid/`:

```text
main.py          FastAPI app, security middleware, routes, SSE, static SPA serving
manager.py       Run lifecycle, rate limiting, cancellation, timeout, Gemini gate
workflow.py      Per-run ADK Workflow, nodes, revision routing, commit
agents.py        Agent metadata served to the UI
models.py        Pydantic contracts for scenario, world, artifacts, events, reports
worldgen.py      Seeded terrain, districts, roads, facilities, assets
hazards.py       Flood / fire / infrastructure hazard modelling
routing.py       NetworkX routing with closures and weather factors
allocation.py    Capability- and capacity-aware assignment proposal
simulation.py    Time-stepped deterministic plan execution and snapshots
verification.py  Preflight and outcome rule verification with stable finding codes
report.py        Deterministic JSON and Markdown report builder
events.py        Ordered event bus and subscriber queues
store.py         SQLite schema and repositories
config.py        Environment-backed settings and paths
presets.py       The four scenario presets
access.py        Reachability and route-continuity helpers
```

`main.py` contains transport concerns only. ADK nodes are thin wrappers around domain services. Domain functions are testable without a model, network, browser, or database.

## Per-run ADK context

Each run builds a fresh `Workflow` with closures over an isolated `RunContext`:

- immutable scenario input
- artifact slots with fixed ownership
- revision counter
- event sink
- cancellation signal
- algorithm/model versions

This avoids shared mutable global state and makes the workflow reproducible and testable. `max_concurrency=4`.

## Agent graph

```text
START
  → intake
  → world
  → conditions ─┐
  → resources  ─┼→ join → synchronize → preflight
  → access     ─┘                        │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                        pass          revise        exhausted
                          │              │              │
                          ▼              ▼              ▼
                      simulation     revision       simulation
                          │              │
                          ▼              └→ preflight
                       outcome
                          │
                 ┌────────┴─────────┐
                 ▼                  ▼
              report             revise
                 │                  │
                 ▼                  └→ revision → preflight
              reporter
                 │
                 ▼
               commit
```

- Conditions, Resources, and Accessibility are real parallel ADK branches. The `JoinNode` waits for all three.
- `synchronize` reconciles their artifacts before the Critic runs.
- Preflight routes to `simulation`, `revision`, or `exhausted`; exhaustion still simulates but cannot claim a passed verification.
- Outcome verification routes to the reporter on `report`, or back into the bounded revision loop on `revise`.
- Revision is bounded by `ASTERGRID_MAX_REVISIONS` (default 2). Cycles always have a terminal exit.
- The Critic rules are authoritative. No agent can mark its own output valid.
- Only `commit` promotes artifacts into the validated run bundle.

## Execution modes

`RunManager.create_run` checks `scenario.execution_mode`:

- `deterministic` — accepted; `effective_mode=deterministic`; `model_calls=0`.
- `gemini` without `GEMINI_API_KEY` or `GOOGLE_API_KEY` — rejected with `GEMINI_NOT_CONFIGURED`.
- `gemini` with a key present — rejected with `GEMINI_NOT_ENABLED` (HTTP 501) because no live provider node is implemented.

There is no silent fallback from Gemini to deterministic. This is deliberate: a run's manifest must never misrepresent how it was produced.

## Draft world vs committed world

`POST /api/preview` runs the same versioned world generator used by the World Builder. The result is labelled **DRAFT** in the UI and carries `draft=true`, `generator_version`, and `input_hash`.

`POST /api/runs?preview_world_hash=<hash>` compares the submitted scenario against the preview. A stale or mismatched hash is rejected, so a user cannot start a run against a world different from the one they inspected. During the run, the World Builder commits the authoritative artifact and the frontend promotes the layer only on a hash match.

## Scene state model

The scene never reads raw agent prose. It reads:

| Layer | Source | Visual state |
|---|---|---|
| World | Preview or committed world artifact | Draft / validated |
| Roads and facilities | World artifact | Base |
| Proposal | Allocation artifact | Proposed amber |
| Preflight result | Verification artifact | Accepted / rejected |
| Routes | Access + assignment artifacts | Proposed / validated / rejected |
| Assets and conditions | Simulation snapshots | Validated |
| Findings | Verification artifacts | Overlay and inspector |

Only validated simulation snapshots can promote proposed state to the solid scene. A failed run leaves the last validated scene visible.

## Event sequencing

One writer per run:

1. Allocates the next monotonic sequence.
2. Persists the event to SQLite.
3. Broadcasts it to live subscribers.
4. Retains a bounded in-memory backlog.

SSE uses the sequence as the event ID (`id: <seq>`), and the JSON payload is the event. Reconnect replays with `?after=<last seq>` (the backend does not read the `Last-Event-ID` header). The frontend deduplicates by `event_id`, orders by `seq`, and falls back to polling `/api/runs/{id}/events` if streaming fails.

## API routes

```text
GET  /api/health
GET  /api/meta
GET  /api/presets
GET  /api/agents
POST /api/preview
POST /api/runs?preview_world_hash=<hash>
GET  /api/runs?limit=<n>
GET  /api/runs/{run_id}
GET  /api/runs/{run_id}/bundle
GET  /api/runs/{run_id}/events?after=<seq>
GET  /api/runs/{run_id}/stream?after=<seq>
GET  /api/runs/{run_id}/report
GET  /api/runs/{run_id}/report.md
POST /api/runs/{run_id}/cancel
```

When a production frontend build exists, `/assets` is mounted from `frontend/dist/assets` and a catch-all route serves static files plus the SPA fallback. Unknown `/api/*` paths return a structured `NOT_FOUND` error, never the SPA shell.

## Persistence

SQLite tables:

- `schema_meta` — schema version marker
- `runs` — scenario input, effective mode, status, hashes, manifest
- `events` — ordered event log, primary key `(run_id, seq)`
- `snapshots` — time-indexed simulation state, primary key `(run_id, tick)`
- `artifacts` — typed agent outputs, primary key `(run_id, kind)`
- `reports` — JSON and Markdown exports

Default data directory is `%LOCALAPPDATA%\ASTERGRID` on Windows and `~/.astergrid` elsewhere. WAL journaling, foreign keys, 5 s busy timeout, and write serialization are enabled.

`SCHEMA_VERSION = 1` is written to `schema_meta`. There is no migration runner and the stored version is not validated at startup; a schema change requires an explicit migration before release.

On startup, runs left in a non-terminal state are marked `interrupted` rather than deleted, and old runs beyond the retention limit are pruned.

## Determinism and versioning

Every run records:

- input hash
- world hash
- result hash
- `worldgen`, `routing`, `allocator`, `simulation`, and `verifier` versions
- effective execution mode and model call count
- revision count and timing
- typed artifacts and the full report

Hashes use canonical JSON excluding timestamps and run IDs. The accepted canonical run reproduces world hash `16fdad52…` and result hash `b6303ae8…`; the evidence bundle is committed under `docs/evidence/run_6acc34b0a656/`.

## Security boundaries

- Pydantic models with `extra="forbid"` at API and artifact boundaries.
- No arbitrary URLs, shell commands, generated code, or filesystem paths from agents.
- Model tools, if added later, must be explicit typed domain functions.
- API keys stay server-side; the public repository never contains `.env`.
- The server binds to `127.0.0.1` by default.
- CORS is limited to the two local Vite origins.
- Security headers and a strict CSP are applied by middleware.
- API mutation bodies are limited to 256,000 bytes.
- Run creation is rate-limited to 6 per minute per process.
- The UI labels deterministic execution and never presents policy functions as LLM reasoning.

Full policy: [`SECURITY.md`](SECURITY.md).

## Frontend state

- `scenarioDraft` — editable configuration, separate from an active run
- `run` — current lifecycle and effective mode
- `events` — ordered, deduplicated log and derived agent statuses
- `world` — draft or committed world artifact
- `artifacts` — typed agent outputs
- `snapshots` — validated timeline
- `ui` — selection, preset, layers, quality, motion, drawers

The 3D scene subscribes to stable slices. Asset motion uses refs and frame interpolation, not per-frame React state. The mobile compact layout keeps one `SceneView` mounted and hides inactive tabs with CSS; when the scene column is inactive, the canvas uses `frameloop='never'` to avoid R3F/HTML portal teardown crashes.

## Deployment shape

P0 runs locally:

```text
uv run python -m astergrid
  → Uvicorn on 127.0.0.1:8000
  → /api/* routes
  → static frontend build at /
```

No cloud dependency is required. CI and Docker remain P1 and are not part of this build.