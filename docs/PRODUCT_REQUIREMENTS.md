# Product Requirements

## Product

**ASTERGRID — 3D Scenario Intelligence & Multi-Agent Command Lab**

A local, single-user browser application for constructing fictional coordination scenarios, running a real multi-agent ADK workflow, inspecting agent artifacts and verification results, replaying a deterministic simulation on a 3D map, and exporting a reproducible report.

## Problem

Agent demos often show a chat transcript or animated avatars with no way to tell whether the system actually coordinated anything. ASTERGRID makes coordination auditable:

- Every agent has typed inputs and outputs.
- Every numeric outcome comes from deterministic software.
- Every scene change can be traced to an event, artifact, and validation result.
- Every claim can be checked against simulation state.

## Primary user

A technical evaluator, product reviewer, or engineer who wants to inspect a multi-agent system end to end: configure a scenario, launch it, watch real execution, see proposed changes, verify them, replay the outcome, and export evidence.

## Core loop

1. Choose a fictional world and scenario family.
2. Configure environment, affected districts, resources, and objectives.
3. See a draft synthetic world immediately.
4. Start a run.
5. Observe the agent dependency graph and ordered event stream.
6. Inspect proposed allocations and agent findings.
7. Watch preflight verification reject an infeasible proposal.
8. Follow the bounded revision.
9. See validated simulation snapshots on the 3D map.
10. Scrub the timeline, inspect provenance, and export the report.
11. Re-run the same seed and confirm the result hash.

## Scenario families

| Family | Objective | Hazard / constraint |
|---|---|---|
| Flood response | Shelter coverage, supply delivery, medical access | Rising water closes low-lying crossings |
| Wildfire evacuation | Evacuation completion, shelter capacity | Wind-driven perimeter closes roads |
| Infrastructure disruption | Supply continuity, repair completion | Bridge/comms outage and repair tasks |
| Exploration / survey | Coverage maximization | Battery, terrain, and visibility limits |

All geography and populations are synthetic. Users may not supply real-world targets, coordinates, or operational data.

## Functional requirements

### Scenario builder

- Scenario family, world preset, seed, duration, start hour.
- Rainfall, wind speed/direction, visibility, terrain saturation, disruption level.
- Affected districts.
- Resource counts for rescue, medical, supply, and survey assets.
- Objective weights for coverage, delivery, response time, and survey.
- Inline validation and server-side revalidation.
- Draft world preview without creating a run.

### 3D command center

- Interactive terrain with contours, districts, river, roads, bridges, facilities, assets, hazards, and routes.
- Selection, hover, focus, zoom, pan, rotation, reset.
- Observed, proposed, validated, rejected, and stale visual states.
- Nine presentation presets that change camera and rendering state.
- Day/night and weather rendering.
- Timeline playback and scrubbing.
- Provenance inspector for entities, routes, events, findings, and agents.

### Orchestration

- Real Google ADK workflow.
- Director plus eight specialized agents.
- Parallel Conditions/Resources/Accessibility analyses.
- Preflight and outcome verification.
- Bounded revision, maximum two attempts.
- Explicit failure, cancellation, timeout, and needs-attention states.
- Structured events over SSE with replay and reconnect.
- No fabricated progress, avatars, conversations, or completion percentages.

### Deterministic simulation

- Seeded world generation.
- NetworkX routing with closures and dynamic road state.
- Capability and capacity-aware allocation.
- Generic task simulation for deliver, evacuate, treat, survey, and repair.
- Weather-adjusted travel.
- Time-indexed snapshots and event history.
- Metrics, invariants, and reproducibility hashes.

### Reporting

- Deterministic JSON and Markdown report.
- Allocation table, metrics, findings, revisions, assumptions, and evidence links.
- Execution mode, agent modes, model calls, algorithm versions, and result hash.
- Print-friendly layout.
- Reproducibility action.

## Non-functional requirements

- Local-first, no account, no cloud database, no paid map provider.
- Runs on Windows with Python 3.12 and Node 24.
- Production build served by a single FastAPI process.
- Graceful handling of backend loss, SSE loss, refresh, cancellation, timeout, and malformed inputs.
- Responsive at desktop, tablet, and mobile widths.
- Keyboard access, visible focus, reduced-motion support, readable contrast.
- Public-repository hygiene: no secrets, no runtime databases, no test traces.
- Production-ready main branch and a push after every green session gate.

## Out of scope

- Real emergency response, live operational data, real coordinates, or named-person tracking.
- Weapons, targeting, attack planning, or military coordination.
- Accounts, multi-user collaboration, or cloud deployment in P0.
- Real-time GIS accuracy or ingestion of external geospatial datasets.
- A general-purpose chat interface.

## Acceptance summary

The product is acceptable when a user can launch it locally, configure the default flood scenario, run real ADK orchestration, observe a genuine preflight failure and bounded revision, inspect validated 3D outcomes, replay the timeline, follow provenance, export a report, and reproduce the result hash — with all documented checks passing and no fabricated execution state.
