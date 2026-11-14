from __future__ import annotations

from .models import AgentDescriptor

AGENT_DEFINITIONS: list[AgentDescriptor] = [
    AgentDescriptor(
        id="director",
        name="Scenario Director",
        role="Schedules the ADK graph, enforces budgets, joins branches, and commits the run.",
        mode="deterministic",
        depends_on=[],
    ),
    AgentDescriptor(
        id="intake",
        name="Intake",
        role="Validates the synthetic scenario and records assumptions before any world is built.",
        mode="deterministic",
        depends_on=["director"],
    ),
    AgentDescriptor(
        id="world",
        name="World Builder",
        role="Generates the deterministic terrain, districts, network, facilities, assets, and demands.",
        mode="deterministic",
        depends_on=["intake"],
    ),
    AgentDescriptor(
        id="conditions",
        name="Conditions Analyst",
        role="Projects weather, river stage, fire perimeter, visibility, and road closures.",
        mode="deterministic",
        depends_on=["world"],
    ),
    AgentDescriptor(
        id="resources",
        name="Resource Coordinator",
        role="Proposes capability and capacity assignments from an optimistic static plan.",
        mode="deterministic",
        depends_on=["world"],
    ),
    AgentDescriptor(
        id="access",
        name="Accessibility Agent",
        role="Checks projected reachability from demand nodes to their destinations.",
        mode="deterministic",
        depends_on=["world"],
    ),
    AgentDescriptor(
        id="critic",
        name="Critic / Verifier",
        role="Applies authoritative preflight and outcome rules; findings are not negotiable prose.",
        mode="deterministic",
        depends_on=["conditions", "resources", "access"],
    ),
    AgentDescriptor(
        id="simulation",
        name="Simulation Agent",
        role="Executes the validated plan on the deterministic time engine and records snapshots.",
        mode="deterministic",
        depends_on=["critic", "resources", "access"],
    ),
    AgentDescriptor(
        id="reporter",
        name="Reporter",
        role="Builds the reproducible report from validated artifacts, metrics, and findings.",
        mode="deterministic",
        depends_on=["critic", "simulation"],
    ),
]

AGENT_ORDER = [agent.id for agent in AGENT_DEFINITIONS]
AGENT_BY_ID = {agent.id: agent for agent in AGENT_DEFINITIONS}
