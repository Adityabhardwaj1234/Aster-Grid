# Session Log

Each entry records a green production checkpoint. The remote URL is intentionally not stored here; it belongs only in Git configuration.

## 2026-10-23 — M0: Repository, brand, docs

- Initialized Git repository on `main`.
- Added `origin` remote through Git configuration only.
- Added MIT license, ignore rules, environment template, README, required docs.
- Generated brand hero and radar mark from the supplied artwork.
- Added production verification script.
- Recorded ADK Agent Builder environment and SkillsBridge limitation.
- Tests: pending project implementation.
- Push: pending initial commit.

## 2026-11-14 — M1–M6: Working command center and accepted evidence

### Delivered

- React 19 + Vite 7 + TypeScript command center with a Three.js/R3F scene, nine render presets, scenario builder, agent lattice, execution Gantt, evidence inspector, replay scrubber, report modal, and JSON/Markdown exports.
- Responsive desktop, tablet, and compact mobile layouts with Scene/Brief/Evidence tabs; keyboard shortcuts; reduced-motion handling; low-end quality controls.
- FastAPI backend with a real per-run ADK 2.12 `Workflow`: `FunctionNode` branches for Conditions, Resources, and Accessibility, a `JoinNode`, preflight verification, bounded revision, outcome verification, and commit.
- Deterministic seeded world generation, routing, allocation, simulation, and reporting. No model credentials required.
- Typed artifacts, SQLite persistence, ordered SSE events with sequence replay, cancellation, timeout, and orphan recovery.
- Security baseline: CSP and companion headers, CORS restricted to the local Vite origins, request body limit, in-process run rate limit, no-store API responses.

### Gemini gate

Gemini is **not implemented**. A request without a key returns `GEMINI_NOT_CONFIGURED` (422); with a key present it returns `GEMINI_NOT_ENABLED` (501). No silent fallback exists and no live provider call was made.

### Canonical evidence

- Run `run_6acc34b0a656`, Riverbend Delta Flood, seed `1847`, 360 minutes, deterministic, zero model calls.
- Status `completed`; 6 findings (3 × `ROUTE_BLOCKED`, 3 × `TIME_WINDOW_OVERLAP`); revision 1 repaired them with four reassignments via `B-3` (3.5 m clearance over a 3.3 m peak).
- World hash `16fdad52f710cd7523cf862929fdc91eacd5bb0611652f21f7f84c4023fe2385`; result hash `b6303ae898c3a7eb9e8065b4f22b09048637c45d52e000f70363bc8fca8b9627`.
- Record, bundle, Markdown report, and 18 production-build screenshots are committed under `docs/evidence/`.

### Verification totals

- Backend: **17 passed** (`uv run --extra dev python -m pytest -q`).
- Backend lint and format: Ruff clean.
- Frontend unit tests: **28 passed** on Vitest 4.1.12.
- Frontend typecheck and production build: pass.
- Browser acceptance: **8 passed** (Chromium, production build served by FastAPI on an isolated port).
- Dependency audit: `npm audit` reports 0 vulnerabilities after upgrading Vitest from 3.2.7 to 4.1.12 to clear two critical advisories.

### Defects found and fixed during finalization

1. **Missing accessible names.** `AgentRail`, `InspectorPanel`, and `MetricsPanel` used `aria-labelledby` pointing at IDs that `PanelTitle` never rendered. The new provenance browser assertion timed out on the unnamed Evidence inspector region. `PanelTitle` now accepts an `id` and all three panels render it. The isolated regression test passed in 43 s after the fix, and the full gate was rerun.
2. **Unsigned Windows console-script shims.** A fresh-context README usability test showed that `uv run astergrid` and `uv run uvicorn` can be blocked by Windows Smart App Control with `os error 4551`. The README, `scripts/dev.ps1`, and `scripts/verify.ps1` now use tested module forms (`python -m astergrid`, `python -m uvicorn`, `python -m pytest`, `python -m ruff`).
3. **Transient install failure.** `npm ci` failed once with `ECONNRESET`; the README documents a single retry. The second attempt succeeded.
4. **Stale SSE dependency.** Unused `sse-starlette` was removed; SSE is implemented with Starlette `StreamingResponse`.
5. **Mobile scene crash.** Switching compact tabs could unmount the R3F canvas while an HTML portal was attached, producing `removeChild` errors. The layout now keeps one `SceneView` mounted, hides inactive columns with CSS, and sets `frameloop='never'` when the scene is inactive.

### Documentation and standards

- Added `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/ACCEPTANCE.md`, `docs/TEST_PLAN.md`, `docs/evidence/README.md`, and refreshed the roster, routing, tooling, and asset docs against the implementation.
- Created the global skill `high-craft-product-ui` with reference standards, project-document templates, design tokens, render-preset guidance, and provenance-labelled ASTERGRID screenshots.
- Added a global rule requiring that skill and filled-in `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `ACCEPTANCE.md`, README, and verified evidence for every multi-file product.

### Known limitations

- Gemini execution is not implemented or provider-tested.
- SSE reconnect and the polling fallback are implemented but not fault-injected in an automated test.
- No browser test kills a live run mid-stream to prove the last validated scene is retained, although snapshots are only promoted after validation.
- No frame-timing benchmark on the integrated GPU.
- No screen-reader session with an assistive-technology user.
- The app is local and single-user with no authentication; it must not be exposed publicly as-is.
- No CI, container packaging, or SQLite migration runner.

### Finalization

- `scripts\verify.ps1` passed on the final tree with the totals above.
- Commit and remote `HEAD` equality are recorded in `docs/ACCEPTANCE.md`.
