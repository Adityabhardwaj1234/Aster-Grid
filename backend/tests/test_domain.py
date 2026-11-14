from __future__ import annotations

from astergrid.allocation import first_pass, repair_pass
from astergrid.presets import PRESETS
from astergrid.routing import route
from astergrid.simulation import simulate
from astergrid.verification import verify_outcome, verify_preflight
from astergrid.worldgen import generate_world

from .helpers import prepare_domain


def test_default_world_is_deterministic_and_uses_only_three_bridges() -> None:
    scenario = PRESETS[0].scenario
    first = generate_world(scenario)
    second = generate_world(scenario)

    assert first.hash == second.hash
    assert first.id == second.id
    assert len(first.districts) == 6
    assert len(first.assets) == 12
    assert {edge.id for edge in first.edges if edge.bridge} == {"B-1", "B-2", "B-3"}
    assert all(edge.clearance_m is not None for edge in first.edges if edge.bridge)

    changed = scenario.model_copy(update={"seed": scenario.seed + 1})
    assert generate_world(changed).hash != first.hash


def test_unknown_route_nodes_fail_explicitly() -> None:
    world = generate_world(PRESETS[0].scenario)
    missing_origin = route(world, "N-999", "N-0-1")
    missing_target = route(world, "N-0-1", "N-999")

    assert missing_origin.reachable is False
    assert missing_origin.node_ids == []
    assert missing_target.reachable is False
    assert missing_target.node_ids == []


def test_flood_first_pass_exposes_real_conflicts_and_repair_clears_them() -> None:
    scenario = PRESETS[0].scenario
    world, conditions, access = prepare_domain(scenario)

    optimistic = first_pass(world, scenario)
    preflight = verify_preflight(world, scenario, optimistic, access, conditions, revision=0)
    codes = [finding.code for finding in preflight.findings]

    assert preflight.passed is False
    assert "ROUTE_BLOCKED" in codes
    assert "TIME_WINDOW_OVERLAP" in codes
    assert len(optimistic.assignments) == 9
    assert optimistic.unassigned == []

    repaired = repair_pass(
        world,
        scenario,
        conditions,
        set(access.closed_edge_ids),
        revision=1,
        reason="; ".join(sorted(set(codes))),
    )
    repaired_preflight = verify_preflight(world, scenario, repaired, access, conditions, revision=1)
    assert repaired_preflight.passed is True, repaired_preflight.findings
    assert all(route_edges for route_edges in [a.route_edge_ids for a in repaired.assignments])
    assert not any(
        edge_id in set(access.closed_edge_ids)
        for assignment in repaired.assignments
        for edge_id in assignment.route_edge_ids
    )

    simulation = simulate(world, scenario, repaired, conditions, access, revision=1)
    outcome = verify_outcome(world, scenario, repaired, simulation, revision=1)
    assert simulation.hash
    assert outcome.passed is True, outcome.findings
    assert simulation.metrics.coverage_pct == 100.0
    assert simulation.metrics.delivery_pct == 100.0
    assert simulation.metrics.survey_pct == 100.0
    assert simulation.metrics.unmet_demand == 0

    repeat = simulate(world, scenario, repaired, conditions, access, revision=1)
    assert repeat.hash == simulation.hash
