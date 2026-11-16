# Acceptance Record

Status values: `PASS`, `FAIL`, `DEFERRED`, `PENDING`.

Acceptance is based on executed evidence, not intent. Where a check has not been run, the item is `PENDING`; where a check is intentionally out of scope, it is `DEFERRED` with a reason.

## P0 functional acceptance

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Repository initialized on `main` with production docs | PASS | Repository on `main`; commit `0e300e9`; `origin/main` matched local `HEAD` at `0e300e9` before this finalization pass; the final documentation commit is verified below |
| 2 | Supplied artwork used as hero and compact radar mark | PASS | `docs/evidence/run_6acc34b0a656/screenshots/launch.png`; `frontend/public/brand/astergrid-hero.jpg`; `frontend/public/brand/astergrid-mark.png`; generator `scripts/prepare_brand.py` |
| 3 | Deterministic demo works without model credentials | PASS | Canonical run `run_6acc34b0a656`: `model_calls=0`, `effective_mode=deterministic`, `status=completed`; `backend/tests/test_api.py::test_analysis_run_stream_bundle_and_report` |
| 4 | Four fictional scenario families available | PASS | `GET /api/presets` returns four scenario presets, one each for flood, wildfire, infrastructure, and exploration; `backend/src/astergrid/presets.py`; preset gallery on the launch screen |
| 5 | Draft world preview uses the committed generator | PASS | `POST /api/preview` calls the same `generate_world` used by the World Builder; `backend/tests/test_domain.py::test_default_world_is_deterministic_and_uses_only_three_bridges`; stale preview hash rejection covered by API validation |
| 6 | Real ADK workflow executes | PASS | Per-run `google.adk.workflow.Workflow` in `backend/src/astergrid/workflow.py`; `backend/tests/test_workflow.py` (default graph, four scenario presets, stale-preview rejection); run manifest records an ADK workflow run |
| 7 | Conditions/Resources/Accessibility genuinely overlap | PASS | Three `FunctionNode` branches joined by `JoinNode(name="join")`; Gantt E2E asserts the parallel-branch annotation and overlapping bars; `docs/evidence/run_6acc34b0a656/screenshots/modal-gantt.png` |
| 8 | Default scenario produces a real preflight failure | PASS | Canonical run contains six findings: three `ROUTE_BLOCKED` and three `TIME_WINDOW_OVERLAP`; `backend/tests/test_domain.py::test_flood_first_pass_exposes_real_conflicts_and_repair_clears_them` |
| 9 | Bounded revision repairs or escalates honestly | PASS | Canonical run: `revision_count=1`, four reassignments via `B-3` (3.5 m clearance over 3.3 m peak); revision bounded by `ASTERGRID_MAX_REVISIONS`; exhaustion path tested in workflow tests |
| 10 | Simulation is deterministic and reproducible | PASS | World hash `16fdad52f710cd7523cf862929fdc91eacd5bb0611652f21f7f84c4023fe2385`; result hash `b6303ae898c3a7eb9e8065b4f22b09048637c45d52e000f70363bc8fca8b9627`; identical-hash assertion in domain tests |
| 11 | Validated routes/assets render in 3D | PASS | `docs/evidence/run_6acc34b0a656/screenshots/desktop-command.png`; capture reports `canvas=true webglFallback=false problems=[]` |
| 12 | Proposed/rejected/validated states are distinct | PASS | Amber proposal ghosts, rejection overlays, and validated solid geometry in `frontend/src/components/scene/`; E2E run-to-commit flow and screenshots show distinct states |
| 13 | Nine presets change real camera/layer state | PASS | `frontend/src/lib/viewPresets.test.ts`; E2E switches all nine presets; screenshots `preset-01` … `preset-09` |
| 14 | Timeline replay and event markers work | PASS | E2E `switches all nine render presets, replays, and honours keyboard shortcuts`; timeline scrub wired to validated snapshots |
| 15 | Provenance links scene state to events/findings | PENDING | E2E assertion added: Events tab → newest event → Inspect → `Sequence`, `Verified bundle`, `Hash chain`. Requires the final full Playwright run |
| 16 | Report exports JSON and Markdown | PASS | `docs/evidence/run_6acc34b0a656/report.md`; `GET /api/runs/{id}/report` and `.md`; E2E download assertions; `screenshots/modal-report.png` |
| 17 | SSE reconnect and polling fallback work | DEFERRED | SSE replay with `?after=` is covered by `test_analysis_run_stream_bundle_and_report`. Automatic reconnect and the polling fallback are implemented in `useAppStore.ts` but are not fault-injected in an automated test; adding that needs a stream-kill harness. Not claimed as verified. |
| 18 | Cancellation and timeout produce honest terminal states | PASS | `backend/tests/test_lifecycle.py`: cancel, timeout, and orphaned-run interruption through the API |
| 19 | Failed run keeps last validated scene | DEFERRED | The scene only promotes validated snapshots, so the behavior is structurally enforced. A dedicated browser test that kills a live run mid-stream was not written; not claimed as browser-verified. |
| 20 | Responsive desktop/tablet/mobile layouts | PASS | `screenshots/desktop-command.png`, `tablet-command.png`, `mobile-scene.png`, `mobile-brief.png`, `mobile-evidence.png`; E2E `keeps tablet and mobile command layouts usable` |
| 21 | Keyboard and reduced-motion support | PASS | E2E keyboard-shortcut assertions; `prefers-reduced-motion` handling in `SceneView.tsx` with a visible “Honoured by system” status; focus-visible styles and dialog focus management |
| 22 | No secrets or runtime data committed | PASS | `scripts/verify.ps1` refuses a tracked `.env`, scans tracked files for key/private-key patterns, and `git diff --check`; `.gitignore` excludes databases, WAL/SHM, build output, and test artifacts |
| 23 | README setup reproduced by a fresh user | PASS | Fresh-context subagent followed the README: `uv sync --extra dev`, `npm ci` (one transient `ECONNRESET`, documented retry), `npm run build`, health JSON, and SPA root all passed. The test exposed Windows Smart App Control blocking unsigned `.venv\Scripts\*.exe` shims; the README now documents the tested `python -m astergrid` / `python -m uvicorn` module forms and root-relative paths. The operator's `uv run astergrid` failure and the live `python -m astergrid` health check are recorded in `docs/evidence/windows-app-control-diagnosis.pdf`. See `docs/SESSION_LOG.md`. |
| 24 | Production build served by FastAPI | PASS | Playwright runs against the isolated production server on port `8127`, which serves `frontend/dist` through the FastAPI static/SPA routes |
| 25 | Remote `main` matches local `HEAD` after push | PENDING | `git ls-remote origin refs/heads/main` compared with local `HEAD` at the end of the finalization pass |

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Backend tests | `uv run --extra dev python -m pytest -q` (in `backend`) | 17 passed |
| Backend lint | `uv run --extra dev python -m ruff check .` | Clean |
| Backend format | `uv run --extra dev python -m ruff format --check .` | Clean |
| Frontend typecheck | `npm run typecheck` | Clean |
| Frontend unit tests | `npm run test:run` | 28 passed |
| Frontend production build | `npm run build` | Succeeds |
| Browser acceptance | `node node_modules\@playwright\test\cli.js test` (in `frontend`) | 8 passed (Chromium, production build) |
| Dependency audit | `npm audit` (frontend) | 0 vulnerabilities after upgrading Vitest to 4.1.12 |
| Visual evidence | `node scripts/capture-evidence.mjs --run run_6acc34b0a656 --base http://127.0.0.1:8000` | 18 screenshots captured; no console errors; canvas present |

The authoritative gate is `powershell -ExecutionPolicy Bypass -File scripts\verify.ps1`, which runs the sequence above. Counts are the observed results from this build; rerun the gate before relying on them after any change.

## Explicit non-claims

- **Gemini mode is not implemented.** A missing key returns `GEMINI_NOT_CONFIGURED` (422). A present key returns `GEMINI_NOT_ENABLED` (501). No live provider call was made or tested.
- **No operational use.** All geography, populations, facilities, and events are synthetic. ASTERGRID is not for real dispatch, targeting, surveillance, or military planning.
- **No cloud or multi-user claims.** The app is local and single-user with no authentication. It must not be exposed to a public network as-is.
- **No migration tooling.** `SCHEMA_VERSION = 1` is recorded but not validated at startup; there is no migration runner.
- **No CI/Docker.** P0 is the local production build; CI and container packaging remain future work.

## Final acceptance statement

ASTERGRID is accepted when every P0 item is `PASS` or explicitly `DEFERRED` with a reason, the full verification gate passes on the final tree, the production build is served and exercised by the browser suite, and the final commit is pushed to the configured remote with the remote `HEAD` matching local `HEAD`.