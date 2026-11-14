# Agent Roster

ASTERGRID exposes nine agent identities in the UI. The **Scenario Director** is the ADK `Workflow` scheduler; the remaining eight are typed workflow nodes or deterministic services. All execution in this build is deterministic policy. No LLM agent is implemented.

| Agent ID | Role | Inputs | Output | Implementation |
|---|---|---|---|---|
| `director` | Scheduler, budgets, routing, final commit | Validated scenario | Run manifest | ADK `Workflow` with `FunctionNode`s and a `JoinNode` |
| `intake` | Validate configuration and combinations | Scenario draft | `IntakeArtifact` | Pydantic schema and combination validation |
| `world` | Build or load seeded world | Intake artifact | `WorldArtifact` | Versioned seeded world generator |
| `conditions` | Weather, visibility, hazard interpretation | World | `ConditionsReport` | Deterministic hazard policy |
| `resources` | Propose capability/capacity assignments | World, conditions | `AllocationProposal` | Capability- and capacity-aware allocator |
| `access` | Reachability, route continuity, coverage | World | `AccessReport` | NetworkX routing with closures and weather factors |
| `critic` | Preflight and outcome verification | All artifacts | `VerificationReport` | Rule verifier with stable finding codes; runs as `preflight` and `outcome` nodes |
| `simulation` | Execute the validated plan over time | Proposal, access, conditions | `SimulationResult` | Time-stepped deterministic engine |
| `reporter` | Render the validated report | Validated artifacts | `FinalReport` | Deterministic JSON/Markdown template |

`revision` is an additional deterministic repair node, not a separately advertised agent. It is bounded by `ASTERGRID_MAX_REVISIONS` (default 2).

## Dependency graph

```text
director (ADK Workflow)
  └─ intake
       └─ world
            ├─ conditions ─┐
            ├─ resources  ─┼→ join → synchronize → preflight (critic)
            └─ access     ─┘                      │
                                  ┌───────────────┼───────────────┐
                                  ▼               ▼               ▼
                                pass           revise         exhausted
                                  │               │               │
                                  ▼               ▼               ▼
                              simulation       revision       simulation
                                  │               │
                                  ▼               └→ preflight
                               outcome (critic)
                                  │
                         ┌────────┴─────────┐
                         ▼                  ▼
                      reporter           revision → preflight
                         │
                         ▼
                      commit
```

Conditions, Resources, and Accessibility are real parallel ADK branches. The `JoinNode` waits for all three, and `synchronize` reconciles their artifacts before the Critic runs.

## Ownership

- Each node writes only its declared artifact slot.
- Competing agents cannot overwrite each other's outputs.
- The Critic cannot mutate assignments; it produces findings.
- Revision is a bounded repair policy, not an LLM.
- Only `commit` promotes artifacts into the validated run bundle.

## Failure and waiting states

- `waiting` — an upstream dependency has not completed.
- `active` — the node is actually executing.
- `completed` — includes duration and artifact hash.
- `failed` — includes a structured error code.
- `needs_attention` — verification could not be satisfied within the bounded revision budget.
- `interrupted` — the process restarted while the run was non-terminal.

No agent is shown as reasoning when it is waiting.

## Decision evidence

Each agent emits a concise decision summary and structured evidence, not private chain-of-thought. Examples:

- Resource: “R-03 assigned to Shelter S-2: nearest capable team, static ETA 18 min, capacity 4/6.”
- Accessibility: “Bridge B-2 closed at T+90; 4 tasks lose their primary route.”
- Critic: “Preflight failed: `ROUTE_BLOCKED` (A-07), `TIME_WINDOW_OVERLAP` (M-01).”
- Revision: “A-07 reassigned via north crossing; M-01 shift moved to M-02; 1 low-priority task deferred.”

## Gemini mode

Gemini mode is **not implemented**. Without a provider key, the API returns `GEMINI_NOT_CONFIGURED` (422). With a key present, it returns `GEMINI_NOT_ENABLED` (501). There is no silent fallback and no `LlmAgent` in the workflow. See [Model Routing](MODEL_ROUTING.md).