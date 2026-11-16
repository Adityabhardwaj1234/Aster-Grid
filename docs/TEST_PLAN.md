# Test Plan

## Principles

- Test actual behavior, not mocks of the thing under test.
- Deterministic mode is the acceptance path.
- Every failure state must remain distinguishable from success.
- Browser tests run against the production build served by FastAPI.
- Visual results are captured and inspected, not assumed.
- No result is reported as passing unless the command was actually run.

## Commands

```powershell
# Full gate (repository hygiene, backend, frontend, browser)
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1

# Fast inner loop without Playwright
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipE2E

# Backend
cd backend
uv sync --extra dev
uv run --extra dev python -m pytest -q
uv run --extra dev python -m ruff check .
uv run --extra dev python -m ruff format --check .

# Frontend
cd ..\frontend
npm run typecheck
npm run test:run
npm run build
node node_modules\@playwright\test\cli.js test
```

`uv sync --extra dev` is required. Without the dev extra, `python -m pytest` can fall through to a system Python instead of the project environment. Module forms are used deliberately: unsigned console-script shims in `.venv\Scripts` can be blocked by Windows Application Control with `os error 4551`.

## Test layers and current coverage

### Backend domain (3 tests)

`backend/tests/test_domain.py`

- `test_default_world_is_deterministic_and_uses_only_three_bridges` — identical world hash for identical inputs, different hash for a changed seed, six districts, twelve assets, exactly three bridges with clearance.
- `test_unknown_route_nodes_fail_explicitly` — unknown route endpoints raise a precise error rather than resolving to a fallback.
- `test_flood_first_pass_exposes_real_conflicts_and_repair_clears_them` — the default flood plan produces blocking findings on the first pass, and the repair pass clears them through a valid reroute.

These tests exercise worldgen, routing, allocation, simulation, and verification without a model, network, browser, or database.

### Backend API (4 tests)

`backend/tests/test_api.py` (FastAPI `TestClient`, temporary data directory, missing frontend directory)

- `test_health_meta_and_presets` — health, metadata, and the four scenario presets.
- `test_analysis_run_stream_bundle_and_report` — create a run, read ordered events, replay the stream, fetch the typed bundle and both report formats, confirm the terminal state.
- `test_api_validation_and_honest_gemini_gate` — invalid districts and payloads return structured errors; Gemini without a key returns `GEMINI_NOT_CONFIGURED`; Gemini with a key returns `GEMINI_NOT_ENABLED` (501). No silent fallback.
- `test_security_headers_are_applied_to_api_responses` — CSP, nosniff, frame, referrer, permissions, COOP/CORP, and `Cache-Control: no-store`.

### Backend lifecycle (3 tests)

`backend/tests/test_lifecycle.py`

- `test_cancel_returns_an_honest_terminal_state` — cancellation yields `cancelled`, not `completed`.
- `test_timeout_is_persisted_and_emits_a_timeout_event` — the execution budget produces a persisted timeout state and event.
- `test_orphaned_run_is_marked_interrupted_through_the_api` — a run left non-terminal by a restart becomes `interrupted`; evidence is retained.

### Backend persistence (1 test)

`backend/tests/test_store.py`

- `test_store_persists_runs_events_artifacts_and_orphans` — run, event, artifact, snapshot, and report records round-trip; orphan detection works.

### Backend workflow (3 test functions, 6 cases)

`backend/tests/test_workflow.py`

- `test_default_workflow_is_genuinely_parallel_and_verified` — Conditions, Resources, and Accessibility start and overlap, the join is reached, preflight fails, revision repairs, and the committed run is verified.
- `test_every_scenario_reaches_a_verified_commit[<preset>]` — parametrized over all four scenario presets; every preset reaches a terminal, verified commit.
- `test_preview_hash_mismatch_blocks_commit` — a stale preview hash prevents commit.

Backend total: **17 passed**.

### Frontend unit tests (28 tests)

`frontend/src/**/*.test.ts` with Vitest.

- `agents.test.ts` (7) — terminal status handling, duration/call/hash derivation, active-agent cleanup, genuine three-way overlap detection, no false overlap for sequential branches, explicit empty intervals, server wording preserved.
- `format.test.ts` (5) — nullish values, durations/percentages, midnight clock wrap, label/hash normalisation, stable 24-hour timestamps.
- `scenario.test.ts` (4) — accepted deterministic contract, duplicate districts, empty districts/resources, boundary and unknown-key rejection.
- `sceneMath.test.ts` (4) — little-endian heightmap decoding, scene sizing, bilinear elevation sampling, terrain mesh coverage.
- `viewPresets.test.ts` (4) — exactly nine presets, finite cameras and complete palettes, unknown-preset fallback, bounded device pixel ratios.
- `useAppStore.test.ts` (4) — proposal extraction, cache stability, blocking-finding assignment IDs, report-finding preference and stable combination.

Frontend total: **28 passed**. Typecheck and production build are separate gates.

### Browser acceptance (8 tests, Chromium)

`frontend/e2e/` against the production build on an isolated server (`127.0.0.1:8127`) with a temporary data directory and provider keys removed from the environment.

`api.spec.ts` (4 tests)

1. Health/meta honesty and security headers.
2. Preview rejects invalid districts with actionable errors.
3. Gemini is gated instead of silently falling back.
4. Unknown runs return a precise 404.

`astergrid.spec.ts` (4 tests)

1. Launches, builds, runs, and commits a real deterministic workflow; then inspects the newest event and asserts `Sequence`, `Verified bundle`, and `Hash chain` in the Evidence inspector.
2. Exposes the agent graph, Gantt, and report, with JSON and Markdown exports.
3. Switches all nine render presets, replays the timeline, and honours keyboard shortcuts.
4. Keeps tablet and mobile layouts usable, including mobile Scene/Brief/Evidence tabs.

Every test watches for console errors, page errors, and failed same-origin requests. The suite takes about 6–8 minutes on an integrated GPU. The nine-preset test alone has a 360 s budget: headless Chromium renders WebGL in software, so a single actionability check can wait several frames. The budget covers rendering cost; no assertion is relaxed.

### Visual evidence (18 screenshots)

`frontend/scripts/capture-evidence.mjs` captures the launch screen, the command center, all nine presets, the three modals, the tablet layout, and the three mobile tabs. It fails if the run is missing, the canvas is absent, or the page reports errors. Results and inspection notes are indexed in `docs/evidence/README.md`.

## Manual checks performed

- Inspected every screenshot for hierarchy, clipping, overflow, contrast, and responsive behavior.
- Confirmed the mobile `removeChild` regression is fixed: the compact layout keeps one `SceneView` mounted, hides inactive tabs with CSS, and sets `frameloop='never'` when the scene column is inactive.
- Confirmed reduced-motion behavior shows an explicit “Honoured by system” status.
- Confirmed the report modal and exports contain the expected findings, revision, hashes, and disclaimer.
- Confirmed the production build is served by FastAPI with the SPA fallback and that unknown `/api/*` paths do not return the shell.

## Known coverage gaps

The following are implemented but not fault-injected in an automated test, and are therefore not claimed as verified:

- **SSE reconnect and polling fallback.** Replay with `?after=` is tested. Automatic reconnect and the polling fallback in `useAppStore.ts` need a stream-kill harness.
- **Failed run keeps the last validated scene.** Structurally enforced by promoting only validated snapshots; no browser test kills a live run mid-stream.
- **Frame-rate benchmarks.** Quality presets and device-pixel-ratio bounds are unit-tested, but no automated frame-timing benchmark is recorded on the integrated GPU.
- **Screen-reader sessions.** Semantic landmarks, labels, focus management, and keyboard operation are implemented; no assistive-technology user session has been run.
- **Live Gemini path.** Not implemented; no provider test exists.

## Adversarial inputs covered

- Unknown districts and unknown route nodes.
- Extra/unsupported fields through `extra="forbid"`.
- Duplicate districts and empty resources/objectives.
- Invalid numeric ranges.
- Stale preview hash.
- Oversized API bodies (Content-Length above 256,000 bytes).
- Cancellation, timeout, and restart mid-run.
- Gemini requested without a key or without an implemented provider path.

## Release gate

A change is shippable only when `scripts/verify.ps1` passes on the final tree, the evidence screenshots are refreshed if UI behavior changed, and `docs/ACCEPTANCE.md` reflects the actual results.