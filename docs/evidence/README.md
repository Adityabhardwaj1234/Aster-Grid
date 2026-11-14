# Evidence Index

This directory contains the accepted evidence for ASTERGRID. Every artifact here was produced by the running application or the verification suite, not hand-written.

## Canonical run

| Field | Value |
|---|---|
| Run ID | `run_6acc34b0a656` |
| Scenario | Riverbend Delta Flood |
| Seed | `1847` |
| Duration | 360 minutes |
| Status | `completed` |
| Requested / effective mode | `deterministic` / `deterministic` |
| Model calls | `0` |
| Revisions | `1` |
| Findings | 6 (3 × `ROUTE_BLOCKED`, 3 × `TIME_WINDOW_OVERLAP`) |
| Repairs | 4 reassignments using `B-3`, clearance 3.5 m over a 3.3 m peak |
| World hash | `16fdad52f710cd7523cf862929fdc91eacd5bb0611652f21f7f84c4023fe2385` |
| Result hash | `b6303ae898c3a7eb9e8065b4f22b09048637c45d52e000f70363bc8fca8b9627` |
| Duration | 1879 ms |

The run was created on 2026-11-13 with `POST /api/runs` against the production build served by FastAPI. It is reproducible: the same preset, seed, and parameters produce the same world and result hashes.

## Artifacts

| File | Size | SHA-256 | Contents |
|---|---|---|---|
| `record.json` | 1,683 B | `E5609B41AC8E00DABC165AB27B756C431D7B8CF49EF2A82634BAC32C4E1B7F46` | Persisted run record and manifest: mode, hashes, revisions, algorithm versions, timing |
| `bundle.json` | 294,942 B | `7DC07454D5D768D9AA1CEFDC3DA087377A77DFD4CA4C4B59D96180225A22F04E` | Typed artifacts (`run`, `artifacts`, `report`, `report_markdown`) |
| `report.md` | 5,466 B | `46471FA177E933AFA7B83EAB09E18FE703F2EE5F38F7DCB0EF6D3F457CEBCF8C` | Markdown report exported by the application |

The hashes above are of the committed files. They are recorded so a reviewer can detect accidental edits to evidence. They are not a substitute for re-running the application.

## ADK planning artifacts

The following files record the ADK Agent Builder plan and its requirement extraction. They are retained for auditability, not as evidence of the implemented architecture.

| File | Contents |
|---|---|
| `adk_architecture_plan.json` | Generated architecture plan |
| `adk_requirements.yaml` | Requirement extraction input |
| `adk_requirements_result.json` | Requirement extraction result |

The plan misclassified the brief and was explicitly overridden; see `docs/TOOLING_AND_SKILLS.md`. The implemented graph is documented in `docs/ARCHITECTURE.md` and tested by `backend/tests/test_workflow.py`.

## Screenshots

All screenshots were captured from the production build at `http://127.0.0.1:8000` (viewport sizes in parentheses). The capture script reported `canvas=true`, `webglFallback=false`, and no console errors or page errors.

| File | View | What it proves |
|---|---|---|
| `launch.png` | 1440×900 | Brand hero, original artwork, preset gallery entry, synthetic-data disclaimer |
| `desktop-command.png` | 1440×900 | Three-column command center with the committed flood world, agents, Gantt, and evidence inspector |
| `preset-01-topographic.png` | 1440×900 | Topographic render preset |
| `preset-02-radar-sweep.png` | 1440×900 | Radar sweep render preset |
| `preset-03-night-ops.png` | 1440×900 | Night operations render preset |
| `preset-04-thermal.png` | 1440×900 | Thermal render preset |
| `preset-05-hydrology.png` | 1440×900 | Hydrology render preset |
| `preset-06-coverage.png` | 1440×900 | Coverage render preset |
| `preset-07-wireframe.png` | 1440×900 | Wireframe render preset |
| `preset-08-cinematic.png` | 1440×900 | Cinematic render preset |
| `preset-09-minimal.png` | 1440×900 | Minimal render preset |
| `modal-agents.png` | 1440×900 | Real agent dependency graph: 9/9 complete, bounded revision |
| `modal-gantt.png` | 1440×900 | Execution ledger built from event timestamps, parallel branch annotation |
| `modal-report.png` | 1440×900 | Report with findings, revisions, provenance, and export actions |
| `tablet-command.png` | 1024×768 | Tablet layout with usable scene and command panels |
| `mobile-scene.png` | 390×844 | Compact Scene tab |
| `mobile-brief.png` | 390×844 | Compact Brief tab with agent status |
| `mobile-evidence.png` | 390×844 | Compact Evidence tab |

## Reproduction

Start the production server with the canonical run available:

```powershell
cd backend
uv run astergrid
```

Then, from `frontend/`:

```powershell
node scripts/capture-evidence.mjs --run run_6acc34b0a656 --base http://127.0.0.1:8000
```

The script writes `launch.png`, the command view, all nine presets, the three modals, the tablet view, and the three mobile tabs into `../docs/evidence/<run-id>/screenshots/`. It fails if the run is missing, if the canvas is absent, or if the page reports console errors.

To recreate the run itself, start the app, choose **Riverbend Delta Flood** on the launch screen, keep seed `1847` and duration `360`, and run the deterministic scenario. Hash equality with the values above is the reproducibility check.

## Honesty notes

- The screenshots show synthetic data only. No real geography, people, or operations are depicted.
- No live model provider was used. The canonical run made zero model calls.
- Screenshots are evidence of the rendered production build at capture time. They are not a substitute for the automated browser suite.
- If any artifact is regenerated, update the hash table and the run ID references in `README.md`, `docs/ACCEPTANCE.md`, `docs/ARCHITECTURE.md`, and the session log.