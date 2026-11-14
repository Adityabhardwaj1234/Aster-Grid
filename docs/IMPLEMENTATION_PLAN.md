# Implementation Plan

## Status at handoff

M0–M6 are delivered and verified on the local production build. P0 acceptance is recorded in `docs/ACCEPTANCE.md`, with two explicitly deferred browser fault-injection checks (SSE reconnect/polling fallback and killing a live run mid-stream). M7 remains future work.

The only item not completed as originally worded is M2's automatic reconnect integration test; replay with `?after=` is tested, but reconnect and fallback are not fault-injected.

## Delivery principle

Each session ends at a green production checkpoint. Commit at each gate; run `scripts/verify.ps1`; push `main`; verify the remote SHA. Do not push broken or unfinished code to `main`.

## Gates

### M0 — Repository, docs, brand, tooling

- Initialize Git on `main`, add `origin` remote (URL only in Git config).
- Add ignore rules, MIT license, README, docs, environment template.
- Generate hero, radar mark, and favicon from the supplied JPEG.
- Add production verification script.
- Run the ADK Agent Builder doctor/plan and record output.
- Record SkillsBridge availability honestly.
- Initial commit and push.

### M1 — Deterministic domain core

- Pydantic contracts for scenario, world, allocation, access, simulation, verification, report.
- Seeded world generator with four presets.
- Road graph, flood/fire/outage hazard models.
- Allocation, routing, simulation, verifier, report builder.
- Unit tests for reproducibility, capacity, routing, invariants, revision repair.

### M2 — ADK orchestration, events, API

- Per-run ADK workflow with parallel branches, join, preflight, revision, simulation, outcome verification, reporter.
- Actual agent/tool event wrappers.
- Event store, SSE replay, cancellation, timeout, persistence.
- Run manager, preview endpoint, OpenAPI export.
- Integration tests for lifecycle, revision, parallel overlap, failures, reconnect.

### M3 — Frontend shell and live data

- Vite/React/TypeScript setup, design tokens, launch screen.
- Command center shell, scenario panel, API/SSE client, Zustand store.
- Agent graph, event log, basic timeline.
- Production build and browser smoke test.

### M4 — 3D world

- Terrain and contour shader, waterline, districts, roads, bridges.
- Facilities, assets, routes, hazards, risk and coverage layers.
- Camera rig, focus/reset, picking, labels, nine presets.
- Screenshots and visual inspection.

### M5 — Trust and full loop

- Proposed/validated/rejected states, provenance inspector.
- Execution Gantt and verification panel.
- Timeline playback, event markers, report modal/export, command palette.
- Responsive drawers and accessibility pass.
- End-to-end flood demo.

### M6 — Hardening and handoff

- Adversarial tests, reload/reconnect, cancel, timeout, malformed payloads.
- Playwright screenshots at desktop/tablet/mobile; fix visual defects.
- Fresh-eyes README usability test.
- Final acceptance checklist and evidence.
- Final push and remote verification.

### M7 — P1, not started

- Scenario comparison, a live Gemini path (gate-only today; not implemented), CI, and Docker packaging.

## Commit policy

- Conventional commit per gate.
- Commit only after the relevant tests/build pass.
- Push after each green gate and at session end.
- `main` remains production-ready at all times.

## Session-end protocol

1. Run `scripts/verify.ps1`.
2. Confirm `.env`, databases, traces, and build output are untracked.
3. Update README/docs and `docs/SESSION_LOG.md`.
4. Commit.
5. `git push origin main`.
6. Confirm local `HEAD` equals remote `main`.
7. Report commit SHA, checks, limitations, and next gate.
