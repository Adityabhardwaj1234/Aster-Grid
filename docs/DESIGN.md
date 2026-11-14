# ASTERGRID Design Contract

## 1. Product context

- **Product:** ASTERGRID, a local synthetic scenario-intelligence command lab.
- **Primary users:** analysts and reviewers exploring a fictional response scenario, and engineers inspecting whether the multi-agent system behaved honestly.
- **Critical decisions/actions:** configure a scenario, commit a draft world, start a verified agent run, inspect findings/revisions, replay a simulation, export the evidence report.
- **Native domain artifacts:** terrain, topographical contours, road graphs, bridge closures, service coverage, asset trails, event ledgers, agent dependency graphs, execution Gantt, provenance manifests.
- **Modes:** deterministic `RULES` mode (implemented and accepted); optional `GEMINI` mode (gate scaffolding only, not enabled or live-tested).
- **Explicit non-goals:** real emergency response, real geography, targeting, surveillance, live operational feeds, weapons, or military planning.

## 2. Visual thesis

**Surveyed terrain under live instrumentation.** The product should feel like a precise cartography room: topographic contours, range rings, plotted routes, measured axes, thin bracketed labels, and restrained cyan/teal signals on deep ink. The 3D scene is the hero artifact; rails and dialogs are instruments around it. The interface is dense but orderly, technical without cosplay, and explicit about synthetic data.

Three adjectives: **cartographic, exact, alive**.

Must not look like:

- A generic dark SaaS dashboard with eight identical rounded KPI cards.
- Purple gradient "AI product" styling with decorative orbit animations.
- A glassmorphism panel pile that hides the map.
- A war-room pastiche with unreadable 6px text, fake terminal noise, or fabricated live feeds.

Reference: the supplied `Astergrid.jpeg` artwork and the verified command-center screenshots under `docs/evidence/`.

## 3. Tokens

Tokens live in `frontend/src/styles/global.css`.

| Token | Value | Role |
|---|---|---|
| `--bg-0` | `#03060c` | page ink |
| `--bg-1` | `#050a12` | app background |
| `--bg-2` | `#07111c` | elevated field |
| `--bg-3` | `#0a1724` | active inset |
| `--panel` | `rgba(7, 16, 27, 0.82)` | translucent rail/panel |
| `--panel-solid` | `#08131f` | opaque modal/report surface |
| `--line` | `rgba(125, 190, 209, 0.16)` | hairline border |
| `--line-strong` | `rgba(125, 216, 240, 0.34)` | focus/selected border |
| `--text` | `#e7f4f8` | primary |
| `--text-dim` | `#b2c9d2` | secondary |
| `--muted` | `#6f8b99` | metadata |
| `--cyan` | `#4fd8ff` | primary signal |
| `--teal` | `#5ef2b2` | verified/success |
| `--amber` | `#ffb35c` | proposed/caution |
| `--danger` | `#ff5a6e` | blocking/failure |
| `--violet`, `--blue` | `#b49bff`, `#6d9cff` | alternate categories only |

Typography:

- Display: **Space Grotesk** — product/scenario names, report covers.
- Body: **Inter** — prose, controls, inspector content.
- Mono: **IBM Plex Mono** — run IDs, timestamps, telemetry, map coordinates, micro-labels.
- Eyebrows are uppercase mono at 9–10px with ~0.18em tracking.
- Body copy stays at 12–14px; micro type below 10px is reserved for tertiary chrome with sufficient contrast, never critical prose.
- Fonts are bundled through `@fontsource` latin subsets; no runtime font CDN.

Spacing/radii:

- 4px base unit; rail padding 10–14px; dense rows 7–12px vertical; panel gaps 8–10px.
- Radii: 3px controls, 6px panels, 10px dialogs, 16px only for modal outliers. No card-pill saturation.

## 4. Layout

- **Desktop ≥1181px:** 64px command header; three-rail body — 252px brief/agents, flexible scene, 320px metrics/evidence.
- **Tablet and compact desktop ≤1180px:** scene-first single surface with a bottom dock (Scene / Brief / Evidence / Agents). Scene stays the default; Brief and Evidence stack into scrollable regions.
- **Mobile ≤820px:** compressed gutters, wrapped alerts, safe-area dock padding. At ≤560px the brand wordmark is hidden so the scenario name and status remain visible.
- The scene column uses `minmax(0, 1fr)`; canvas and HUD never force horizontal page scrolling.
- The primary visualization keeps the largest uninterrupted area. Rail cards are secondary instruments, not the hero.
- Tested widths: 1600×1000, 1280×800, 1024×768, 390×844. Also check 320px and landscape phone before major layout work.

## 5. Components and states

- **Launch screen:** artwork-led but information-bearing; scenario preset preview; explicit synthetic disclaimer.
- **Scenario builder:** draft → preview → committed labels; real client and server validation; preview uses the committed generator; stale preview hash blocks start.
- **Command header:** scenario title, status, mode, sequence, live-event state, Graph/Gantt/Report, new scenario.
- **Agent lattice/graph:** deterministic layered dependency graph, actual parallel branch topology, status/duration, bounded revision loop.
- **Execution Gantt:** bars derived only from real timestamped events; axes include milliseconds; observed three-branch overlap is labelled.
- **Scene:** R3F terrain, districts, roads/bridges, facilities, assets, routes, trails, risk/coverage overlays, labels. Proposed routes amber, validated cyan, rejected red/dashed; legend matches.
- **Timeline:** Play/Pause, speed group, jump controls, scrubber with critical-event marks, current tick metrics, real event ticker.
- **Evidence inspector:** findings / event ledger / detail tabs. Findings retain severity, code, stage, entities, evidence, repair hint.
- **Report:** document-like modal with scenario, outcome, revision history, assignment ledger, findings, agent ledger, assumptions, manifest, disclaimer. Markdown/JSON export and print.
- **Empty/loading/error/running/needs-attention/interrupted/cancelled:** every state has explicit copy and a next action. No fabricated progress.

## 6. Motion

- Use motion to explain state: radar sweep, live pulse, route draw, camera ease, event ticker.
- UI transitions 120–220ms; panels 220–320ms; camera 500–900ms; easing `cubic-bezier(0.16, 1, 0.3, 1)`.
- No ambient blobs, bouncy springs, scroll-jacking, or infinite decoration.
- **Reduced motion:** system preference disables auto-rotation/drift and shortens animation. Scene settings show "Honoured by system"; the map remains fully inspectable.
- Nine presets change palette, camera, lighting, contour/risk opacity, and weather presentation together; they are semantic viewing modes, not hue swaps.

## 7. Accessibility

- Every icon-only scene control has `aria-label` + `title`; tooltips are not the only path to a function.
- Visible focus rings, modal focus trap/return, Escape close; backdrop click only closes when no unsaved draft exists.
- Tabs use `role="tablist"` / `aria-selected`; scroll regions and modal actions are labelled.
- Keyboard shortcuts: Space replay, ←/→ scrub, G graph, T Gantt, R report, F focus, Esc clear, `?` hint.
- Keyboard handling yields while focus is in form controls or contenteditable regions.
- Status is conveyed by text/icon as well as color. Severity chips include labels.
- Mobile touch targets are at least 44px; pinch zoom remains available.
- Contrast targets: primary and body text pass 4.5:1 against panel backgrounds; faint text is not used for critical data.
- Synthetic-data disclaimer is visible on the launch screen, in the report, and in exports.

## 8. Responsive and performance

- Quality presets Low / Balanced / High control device-pixel ratio and visual extras; Balanced is default.
- One WebGL canvas only. Geometry/materials/textures are memoized; particle buffers update in place.
- Scene dimensions derive from `world.map_size_m`; camera distances, terrain bounds, lighting and weather volumes scale from the same source.
- Manual HTML labels are bounded and culled; 3D text is not used for critical labels.
- Low-end fallback: a scene error boundary keeps brief, metrics, timeline, and report available with a 2D notice.
- WebGL context loss or blank canvas is treated as a release blocker during browser verification.

## 9. Content integrity

- All geography, populations, assets, facilities, findings, and events are **synthetic and fictional** from a seeded local generator.
- `RULES` means real ADK orchestration with deterministic policy nodes: 0 model calls. `GEMINI` is gated and not enabled in this build.
- Progress/status comes from ordered server events. The Gantt and agent graph never invent rows or timestamps.
- Preflight/outcome findings are emitted by software verification, with stable codes.
- The UI must never claim live provider operation, real dispatch, or external verification.
- Reports always include the synthetic disclaimer, effective mode, model calls, hashes, revisions, limitations, and full finding history.

## 10. Evidence

- Desktop command center, launch screen, agent graph, Gantt, report, all nine presets, tablet, and mobile Scene/Brief/Evidence are captured from the production build under `docs/evidence/run_6acc34b0a656/screenshots/` (18 images). The index, hashes, and capture command are in `docs/evidence/README.md`.
- Browser acceptance: `frontend/e2e/astergrid.spec.ts` and `frontend/e2e/api.spec.ts` (8 tests).
- Unit/contract evidence: Vitest 28 tests and pytest 17 tests at the accepted commit.
- Known visual gaps: low-end GPU frame timing is inferred from quality controls, not profiled with a frame-timing benchmark; live Gemini mode has no visual state because it is not implemented.

## 11. Global reuse standard

This contract is the reference implementation for the global skill `high-craft-product-ui`. New products should reuse the principles, quality gates, evidence discipline, and documentation requirements — not ASTERGRID's brand name, color values, or scenario content. Every multi-file product must produce its own `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `ACCEPTANCE.md`, README, and verified `docs/evidence/` before it is called shipped.
