# ASTERGRID Run Report — Riverbend Delta · Riverbend Delta Flood

**Run:** `run_6acc34b0a656`  
**Generated:** 2026-11-13T14:53:26.870207+00:00  
**Execution mode:** `DETERMINISTIC` · **Model calls:** 0  
**Result hash:** `b6303ae898c3a7eb9e8065b4f22b09048637c45d52e000f70363bc8fca8b9627`  
**World hash:** `16fdad52f710cd7523cf862929fdc91eacd5bb0611652f21f7f84c4023fe2385`

> Synthetic, fictional geography and populations. This is an educational simulation and must not be used for real emergency response, dispatch, surveillance, targeting, or operational planning.

## Scenario

| Field | Value |
|---|---|
| Scenario | Riverbend Delta Flood |
| Type | flood |
| Preset | riverbend |
| Seed | 1847 |
| Duration | 360 min |
| Start | 06:00 |
| Disruption | 0.55 |
| Rainfall | 28 mm/h |
| Wind | 24 km/h |

## Outcome

| Metric | Value |
|---|---|
| Objective score | 98.7/100 |
| Coverage | 100.0% |
| Delivery | 100.0% |
| Survey | 100.0% |
| Median response | 7.2 min |
| Utilization | 5.6% |
| Tasks completed | 9/9 |
| Unmet demand cohorts | 0 |

## Narrative

- Verification recorded 6 blocking finding(s) across the run; the final preflight checked 9 conditions.
- 1 bounded revision pass(es) were applied before the final simulation.
- The simulated result completes 9 of 9 demand cohorts with an objective score of 98.7.
- The plan was validated against projected closures, not merely against the current map.
- The run is deterministic and reproduces from the recorded seed and algorithm versions.

## Assignments

| Assignment | Asset | Demand | Start | End | Load | State |
|---|---|---|---|---|---:|---|
| ASG-DEM-03-A-06 | A-06 | DEM-03 | T+0 | T+23 | 24 | validated |
| ASG-DEM-04-A-05 | A-05 | DEM-04 | T+12 | T+41 | 33 | validated |
| ASG-DEM-05-A-06 | A-06 | DEM-05 | T+24 | T+57 | 42 | validated |
| ASG-DEM-01-A-01 | A-01 | DEM-01 | T+10 | T+51 | 249 | validated |
| ASG-DEM-02-A-04 | A-04 | DEM-02 | T+18 | T+45 | 362 | validated |
| ASG-DEM-08-A-08 | A-08 | DEM-08 | T+0 | T+25 | 46 | validated |
| ASG-DEM-07-A-09 | A-09 | DEM-07 | T+0 | T+24 | 38 | validated |
| ASG-DEM-06-A-07 | A-07 | DEM-06 | T+0 | T+18 | 30 | validated |
| ASG-DEM-09-A-12 | A-12 | DEM-09 | T+45 | T+67 | 2 | validated |

## Unassigned demands

| Demand | Priority | Reason |
|---|---|---|
| — | — | No unassigned demands |

## Findings

| Severity | Code | Message | Entities |
|---|---|---|---|
| ERROR | `ROUTE_BLOCKED` | [preflight] ASG-DEM-01-A-01 uses closed route segment(s) B-2 at T+120. | ASG-DEM-01-A-01, A-01, DEM-01, B-2 |
| ERROR | `ROUTE_BLOCKED` | [preflight] ASG-DEM-08-A-08 uses closed route segment(s) B-2 at T+120. | ASG-DEM-08-A-08, A-08, DEM-08, B-2 |
| ERROR | `ROUTE_BLOCKED` | [preflight] ASG-DEM-07-A-08 uses closed route segment(s) B-2 at T+120. | ASG-DEM-07-A-08, A-08, DEM-07, B-2 |
| ERROR | `TIME_WINDOW_OVERLAP` | [preflight] A-01 is double-booked: ASG-DEM-01-A-01 ends T+52, ASG-DEM-02-A-01 starts T+18. | ASG-DEM-01-A-01, ASG-DEM-02-A-01, A-01 |
| ERROR | `TIME_WINDOW_OVERLAP` | [preflight] A-06 is double-booked: ASG-DEM-03-A-06 ends T+24, ASG-DEM-04-A-06 starts T+12. | ASG-DEM-03-A-06, ASG-DEM-04-A-06, A-06 |
| ERROR | `TIME_WINDOW_OVERLAP` | [preflight] A-08 is double-booked: ASG-DEM-07-A-08 ends T+22, ASG-DEM-08-A-08 starts T+0. | ASG-DEM-07-A-08, ASG-DEM-08-A-08, A-08 |

## Revision history

| Attempt | Trigger | Codes | Assignments changed | Deferred |
|---|---|---|---|---|
| 1 | preflight | ROUTE_BLOCKED, TIME_WINDOW_OVERLAP | 4 | 0 |

## Agent execution

| Agent | Role | Mode | Status | Duration | Calls |
|---|---|---|---|---|---:|
| intake | Intake | deterministic | completed | 14 ms | 1 |
| world | World Builder | deterministic | completed | 66 ms | 1 |
| conditions | Conditions Analyst | deterministic | completed | 53 ms | 1 |
| resources | Resource Coordinator | deterministic | completed | 58 ms | 1 |
| access | Accessibility Agent | deterministic | completed | 64 ms | 1 |
| critic | Critic / Verifier | deterministic | completed | 140 ms | 4 |
| simulation | Simulation Agent | deterministic | completed | 335 ms | 1 |
| reporter | Reporter | deterministic | completed | 11 ms | 1 |

## Assumptions

- Repair policy: ROUTE_BLOCKED; TIME_WINDOW_OVERLAP
- Routes use closures projected at T+120.
- Each asset is reserved for the full travel, service, and secondary leg.
- Weather is synthetic and fixed by the scenario seed.
- River stage is projected to reach 2.41 m by T+120.
- Low bridges are screened against projected clearance, not current state.
- Routes are evaluated against projected hazard closures, not the live map.
- A reachable demand destination does not reserve an asset or guarantee its origin is reachable.
- All geography, people, facilities, and hazards are fictional and generated locally.

## Provenance

- Algorithm versions: `{'worldgen': '1.0', 'routing': '1.0', 'allocator': '1.0', 'simulation': '1.0', 'verifier': '1.0', 'report': '1.0'}`
- Input hash: `c01412c9447449616d2d4a5b3791ddc0172102bfe4c473d397001fc2bad4a2bb`
- Simulation hash: `b6303ae898c3a7eb9e8065b4f22b09048637c45d52e000f70363bc8fca8b9627`
- Evidence events are available through the run stream and event store.
- Re-running the same scenario seed and algorithm versions must reproduce the result hash.

---

*Synthetic, fictional geography and populations. This is an educational simulation and must not be used for real emergency response, dispatch, surveillance, targeting, or operational planning.*
