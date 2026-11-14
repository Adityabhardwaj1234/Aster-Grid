# Model Routing

## Effective mode in this build

| Mode | Implemented | Live-tested | Behaviour |
|---|---|---|---|
| Deterministic policy (`RULES`) | Yes | Yes | Real ADK workflow with deterministic policy nodes. Zero model calls. No credentials required. |
| Gemini (`GEMINI`) | **No** | **No** | Gate only. Rejected before execution. No provider call is made. |

The UI displays `RULES` and `0 MODEL CALLS` for deterministic runs. It never presents policy functions as LLM reasoning.

## Deterministic mode

Every agent is a real ADK workflow node backed by typed domain services:

- Intake validates the scenario.
- World Builder generates the seeded world.
- Conditions computes weather and hazard implications.
- Resources proposes an allocation.
- Accessibility computes routes and reachability.
- Simulation executes the plan.
- Critic verifies preflight and outcome rules.
- Reporter renders a deterministic template.
- Revision performs a bounded, rule-based repair.

This mode is fully reproducible and requires no network access. The accepted run made zero model calls.

## Gemini gate

`RunManager.create_run` checks the requested mode:

| Condition | Response |
|---|---|
| `execution_mode=deterministic` | Accepted; `effective_mode=deterministic`, `model_calls=0` |
| `execution_mode=gemini`, no `GEMINI_API_KEY` or `GOOGLE_API_KEY` | `422 GEMINI_NOT_CONFIGURED` |
| `execution_mode=gemini`, key present | `501 GEMINI_NOT_ENABLED` |

There is no silent downgrade. A run's manifest must never misrepresent how it was produced. This is covered by `backend/tests/test_api.py::test_api_validation_and_honest_gemini_gate` and the Playwright API suite.

## Why Gemini is not enabled

A live provider path would need:

- An ADK `LlmAgent` (or equivalent) wired into the existing `Workflow`.
- Typed tool boundaries for allocation and routing proposals.
- Schema validation of every model output before it can influence an artifact.
- A bounded call budget, retry policy, and timeout.
- Critic authority preserved: the model cannot mark its own output valid.
- Credential handling that keeps keys server-side.
- A provider test run with real credentials and recorded evidence.

None of those are implemented. Adding a placeholder that pretends to call a model would violate the project's evidence standard, so the gate rejects the request instead.

## Proposed routing (not implemented)

If a live path is added later, the intended split is:

| Agent | Model | Why |
|---|---|---|
| Intake | `gemini-2.5-flash` | Structured extraction and configuration summary |
| Conditions | `gemini-2.5-flash` | Interpret hazard conditions into concise assumptions |
| Resources | `gemini-2.5-flash` | Tool-using allocation proposals over typed candidate data |
| Accessibility | `gemini-2.5-flash` | Tool-using route analysis narrative |
| Reporter | `gemini-2.5-flash` | Narrative over deterministic numbers |
| World / Simulation / Critic | No LLM | Authoritative deterministic software |

Proposed guardrails: a maximum of 8 model calls per run, one retry for transient errors only, Pydantic validation before use, no mid-run fallback, and no real operational data.

## Configuration surface

`.env.example` documents `GEMINI_API_KEY` and `ASTERGRID_GEMINI_MODEL` because they are reserved configuration keys. Setting them does **not** enable Gemini in this build; it only changes the rejection from `GEMINI_NOT_CONFIGURED` to `GEMINI_NOT_ENABLED`.

## Honest claim

- Deterministic execution: implemented, tested, and used for acceptance.
- Gemini execution: not implemented and not tested against a provider.
- No token usage, provider latency, or model-quality claim is made.