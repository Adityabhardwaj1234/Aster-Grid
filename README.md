# ASTERGRID

**3D Scenario Intelligence & Multi-Agent Command Lab**

Explore scenarios. Coordinate intelligently. Verify every outcome.

ASTERGRID is a local-first, browser-based synthetic world where a real Google ADK workflow coordinates specialized agents, a deterministic simulation engine calculates outcomes, and a verifiable 3D command center renders the result. It is built for fictional emergency coordination, evacuation, logistics, and survey scenarios. It is **not** a real emergency-response or operational planning system.

## What makes it different

- **Real orchestration, not animated avatars.** A per-run ADK 2.12 `Workflow` executes a typed dependency graph with genuine parallel branches (`conditions`, `resources`, `access`), a `JoinNode`, conditional routing, bounded revision cycles, and structured artifacts.
- **Deterministic truth.** Terrain, routes, capacities, resource state transitions, and metrics are calculated by versioned software, not invented by a model.
- **Agent-to-world synchronization.** Proposals appear as amber ghosts. Only validated state is promoted to the solid 3D scene. Rejected changes stay visibly rejected.
- **Trust interface.** Preflight and outcome verification, stable finding codes, an execution Gantt built from real event timestamps, ordered event history, and provenance links from scene state back to its originating event.
- **No-key demo.** Deterministic policy agents require no model provider and make zero model calls.
- **Reproducibility.** The same seed and configuration produce the same world and result hash. The accepted canonical run is committed under [`docs/evidence/run_6acc34b0a656/`](docs/evidence/run_6acc34b0a656/).

## Quick start

Prerequisites: Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 24+, npm, and network access for the first dependency install.

Run all commands from the repository root unless a step says otherwise.

### 1. Install

From the repository root:

```powershell
cd backend
uv sync --extra dev

cd ..\frontend
npm ci
npm run build
```

`--extra dev` installs the test and lint toolchain (pytest, httpx, Ruff). The full verification gate needs it.

If `npm ci` fails with a transient network error such as `ECONNRESET`, retry it once before investigating.

### 2. Run the production build

From the repository root:

```powershell
cd backend
uv run python -m astergrid
```

Open `http://127.0.0.1:8000`. Use `--port <n>` if port 8000 is occupied.

`python -m astergrid` is the portable entry point. The generated `uv run astergrid` console-script shortcut can be blocked by Windows Application Control / Smart App Control with `Failed to spawn: astergrid` and `os error 4551`, because it is an unsigned `.venv\Scripts\*.exe` shim. The module form runs through `python.exe` and is not affected. The same applies to `uv run uvicorn`; use `python -m uvicorn` if the shim is blocked. The verified diagnosis and live health check are recorded in `docs/evidence/windows-app-control-diagnosis.pdf`.

### 3. Develop

Terminal 1 (from the repository root):

```powershell
cd backend
uv run python -m uvicorn astergrid.main:app --reload --port 8000
```

Terminal 2 (from the repository root):

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to the backend.

### 4. Verify

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

The full gate runs repository hygiene, backend tests, Ruff check and format, frontend typecheck/tests/build, and the eight Playwright browser tests. Add `-SkipE2E` only for a fast inner loop; the shipping gate requires the full run.

Individual suites:

```powershell
cd backend
uv sync --extra dev
uv run python -m pytest -q
uv run python -m ruff check .
uv run python -m ruff format --check .

cd ..\frontend
npm run typecheck
npm run test:run
npm run build
npx playwright test
```

Current verified totals: **backend 17 tests**, **frontend 28 tests**, **Playwright 8 tests**. See [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) and [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).

## Deterministic demo walkthrough

1. Open the launch screen and choose **Riverbend Delta / Flood Response**.
2. Inspect the draft world. It was produced by the same versioned generator the World Builder uses.
3. Select **Run scenario**.
4. Watch the agent graph and execution Gantt. Conditions, Resources, and Accessibility genuinely overlap.
5. The default seed (`1847`, 360 minutes) creates a real preflight conflict: static routes cross closed bridges and medical units are double-booked.
6. Inspect the findings and **Revision 1**, then wait for outcome verification and the validated report.
7. Select an asset, scrub the timeline, and follow the provenance chain from scene state back to its event.
8. Export the report and run the reproducibility check.

The accepted run produced 6 findings and one bounded revision that repaired 4 assignments via rerouting (`B-3`, clearance 3.5 m over a 3.3 m peak) with zero model calls. Exact hashes are recorded in [`docs/evidence/run_6acc34b0a656/`](docs/evidence/run_6acc34b0a656/).

## Execution modes

ASTERGRID records the requested and effective execution mode in every run manifest and report.

| Mode | State in this build | Behaviour |
|---|---|---|
| `deterministic` | Implemented, tested, accepted | Real ADK orchestration with deterministic policy nodes. 0 model calls. No credentials required. |
| `gemini` | **Gated, not implemented** | Without `GEMINI_API_KEY`/`GOOGLE_API_KEY` the API returns `GEMINI_NOT_CONFIGURED`. With a key present it returns `GEMINI_NOT_ENABLED` (HTTP 501). It never silently downgrades to deterministic. |

No live provider path was tested because no credentials were available and no Gemini node implementation exists in this build. The UI therefore labels runs as deterministic and displays `0 MODEL CALLS`.

## Reproducibility and evidence

Canonical accepted run: `run_6acc34b0a656`.

- Status `completed`, revision count `1`, model calls `0`
- World hash `16fdad52f710cd7523cf862929fdc91eacd5bb0611652f21f7f84c4023fe2385`
- Result hash `b6303ae898c3a7eb9e8065b4f22b09048637c45d52e000f70363bc8fca8b9627`
- Scenario: Riverbend Delta Flood, seed `1847`, duration `360` minutes

Evidence directory contents:

- `record.json` — persisted run record
- `bundle.json` — typed artifacts, report, manifest
- `report.md` — exported Markdown report
- `screenshots/` — 18 screenshots from the verified production build covering the launch screen, desktop command center, all nine presets, agent graph, Gantt, report, tablet, and mobile Scene/Brief/Evidence

See [`docs/evidence/README.md`](docs/evidence/README.md) for the full index and capture procedure.

## Data and scope

- All geography, populations, facilities, and events are fictional and generated locally.
- No real coordinates, live feeds, person tracking, weapons, targeting, or military planning.
- No account, cloud database, paid map provider, or model key is required for the deterministic demo.
- See [Security](docs/SECURITY.md).

## Architecture

- [Architecture](docs/ARCHITECTURE.md)
- [Design contract](docs/DESIGN.md)
- [Product requirements](docs/PRODUCT_REQUIREMENTS.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Agent roster](docs/AGENT_ROSTER.md)
- [Model routing](docs/MODEL_ROUTING.md)
- [Test plan](docs/TEST_PLAN.md)
- [Acceptance](docs/ACCEPTANCE.md)
- [Tooling and skills](docs/TOOLING_AND_SKILLS.md)
- [Assets and licenses](docs/ASSETS.md)
- [Session log](docs/SESSION_LOG.md)

## Repository layout

```text
backend/    FastAPI, ADK workflow, deterministic simulation, SQLite
frontend/   React + Three.js command center
docs/       Product, architecture, design, security, acceptance, evidence
scripts/    Brand preparation, dev launcher, E2E server, verification
```

## License

Original code is MIT licensed. The supplied ASTERGRID artwork is user-provided and documented separately in [Assets](docs/ASSETS.md). Third-party fonts, icons, and libraries retain their own licenses.

---

**Synthetic data. Fictional geography. Educational simulation. Not for operational use.**