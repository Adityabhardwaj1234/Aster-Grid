# Tooling and Skills

## Verified environment

| Tool | Version / state |
|---|---|
| Python | 3.12.10 |
| Google ADK | 2.12.0 |
| `adk` CLI | 2.12.0 |
| FastAPI | 0.141.1 |
| Pydantic | 2.14.1 |
| NumPy | 2.5.1 |
| NetworkX | 3.7 |
| aiosqlite | 0.22.1 |
| Node.js | 24.19.0 |
| npm | 11.17.0 |
| uv | 0.12.5 |
| Git | 2.55.0 |
| Chrome / Edge | Installed |
| Playwright | 1.64.1 |
| pytest | 9.x |
| Ruff | 0.17.x |
| React / React DOM | 19.3.x |
| Vite | 7.3.x |
| TypeScript | 5.9.x |
| Three.js | 0.186.x |
| Zustand | 5.0.x |
| Zod | 4.6.x |
| Vitest | 4.1.x |
| Pillow | 13.0.0 |

Hardware: Intel Core i5-10210U, 8 GB RAM, Intel UHD graphics. Default 3D quality is Balanced; cinematic effects are optional.

SSE is implemented with Starlette's `StreamingResponse`. The unused `sse-starlette` dependency was removed from `backend/pyproject.toml`.

## Google ADK verification

A real in-memory ADK 2.12 `Workflow` probe confirmed:

- `Workflow` fan-out to function nodes and `JoinNode` fan-in.
- Both branches executed concurrently.
- `Event(route=...)` conditional routing.
- Bounded workflow cycles.
- `node_info.path` provides unique execution provenance.

The application uses a per-run `Workflow` with isolated context and explicit node wrappers for start/completion events. The workflow test suite exercises the default parallel graph and all four scenario presets.

## ADK Agent Builder

Skill: `Adk-Agent-Builder-Skill` / `adk-agent-builder`.

Doctor result:

- ADK 2.12.0 installed.
- `adk` CLI installed.
- `gcloud` unavailable; fallback mode active.
- Agents CLI unavailable.
- Default model `gemini-2.5-flash`, fallback `gemini-2.5-pro`.
- Daily API budget configured at 20 calls.

Commands used:

```powershell
cd C:\Users\MY PC\.config\opencode\skills\Adk-Agent-Builder-Skill
$env:PYTHONPATH='src'
python -m adk_agent_builder.cli doctor --json
python -m adk_agent_builder.cli plan --spec <astergrid-spec> --output <temp-output>
```

The builder was used for architecture validation and static/test tooling. ASTERGRID's application code is custom because the generated template does not model the 3D scene, deterministic simulation, or the SSE trust interface.

### Recorded limitation in the builder plan command

The builder's requirements parser classified the ASTERGRID brief as `live_voice_agent` and suggested BigQuery/code-execution integrations. That classification is incorrect for this product. The brief contains no audio/video modality; the parser appears to react to the word “streaming” and the detailed workflow description. The generated plan and requirement extraction are retained under `docs/evidence/adk_*.json` / `.yaml` for auditability but were explicitly overridden. The implemented architecture is a custom ADK `Workflow` graph with function nodes, a `JoinNode`, conditional routing, and bounded revision, verified directly against ADK 2.12.0.

## SkillsBridge

Observed state during planning:

- OpenCode MCP resources list was empty; no SkillsBridge MCP broker was registered.
- The SkillBridge V2 CLI exists under the local SkillsBridge repository.
- `~/.skillbridge/skillbridge.db` was malformed. A catalog search failed with `database disk image is malformed`.
- The database was not modified during planning.

Consequence: the requested SkillsBridge skill search could not be completed. No unrelated skills were installed or executed. Repairing or rebuilding the SkillBridge catalog requires explicit user approval because it mutates local user state.

## Global product-craft standard

ASTERGRID is the reference implementation for the global skill `high-craft-product-ui` at `C:\Users\MY PC\.config\opencode\skills\high-craft-product-ui\`.

The skill contains:

- `SKILL.md` — the mandatory UI and delivery standard.
- `references/` — visual direction, layout, motion, quality gates, evidence, and documentation rules.
- `assets/` — verified ASTERGRID screenshots with provenance notes.
- `templates/` — starting points for `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `ACCEPTANCE.md`.
- Token, layout, and render-preset references derived from this project.

Every new multi-file product must use that skill and produce filled-in `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `ACCEPTANCE.md`, plus a README and verified `docs/evidence/`. ASTERGRID's own copies are in `docs/`.

## Verification policy

- The production check is `scripts\verify.ps1`.
- It uses `uv run --extra dev` for pytest, Ruff check, and Ruff format.
- Screenshots are captured with Playwright and inspected.
- A fresh-context subagent follows the README for usability verification.
- Test results are recorded with actual output in `docs/TEST_PLAN.md`, `docs/ACCEPTANCE.md`, and `docs/SESSION_LOG.md`.