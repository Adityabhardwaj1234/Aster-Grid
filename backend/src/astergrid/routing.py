from __future__ import annotations

from dataclasses import dataclass

import networkx as nx

from .models import RoadEdge, ScenarioConfig, World


@dataclass(frozen=True)
class RouteResult:
    node_ids: list[str]
    edge_ids: list[str]
    travel_min: float
    reachable: bool
    blocked_edge_ids: list[str]
    distance_m: float = 0.0


def _edge_lookup(world: World) -> tuple[dict[tuple[str, str], RoadEdge], dict[str, RoadEdge]]:
    by_pair: dict[tuple[str, str], RoadEdge] = {}
    by_id: dict[str, RoadEdge] = {}
    for edge in world.edges:
        by_pair[tuple(sorted((edge.a, edge.b)))] = edge
        by_id[edge.id] = edge
    return by_pair, by_id


def build_graph(
    world: World,
    *,
    closed_edges: set[str] | None = None,
    travel_factor: float = 1.0,
    visibility_factor: float = 1.0,
) -> nx.Graph:
    closed = closed_edges or set()
    graph = nx.Graph()
    for node in world.nodes:
        graph.add_node(node.id, x=node.x, z=node.z)
    for edge in world.edges:
        if edge.id in closed:
            continue
        base_minutes = edge.length_m / (edge.speed_kph * 1000.0 / 60.0)
        weight = max(0.05, base_minutes * travel_factor * visibility_factor)
        graph.add_edge(edge.a, edge.b, weight=weight, edge_id=edge.id, length_m=edge.length_m)
    return graph


def static_route(world: World, origin: str, target: str, travel_factor: float = 1.0) -> RouteResult:
    return route(world, origin, target, closed_edges=set(), travel_factor=travel_factor)


def route(
    world: World,
    origin: str,
    target: str,
    *,
    closed_edges: set[str] | None = None,
    travel_factor: float = 1.0,
    visibility_factor: float = 1.0,
) -> RouteResult:
    if origin == target:
        return RouteResult([origin], [], 0.0, True, [])
    graph = build_graph(
        world,
        closed_edges=closed_edges,
        travel_factor=travel_factor,
        visibility_factor=visibility_factor,
    )
    if origin not in graph or target not in graph:
        return RouteResult([], [], 0.0, False, [])
    try:
        node_ids = nx.shortest_path(graph, origin, target, weight="weight")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return RouteResult([], [], 0.0, False, [])
    edge_ids: list[str] = []
    distance = 0.0
    weight = 0.0
    for a, b in zip(node_ids, node_ids[1:], strict=False):
        data = graph.get_edge_data(a, b)
        edge_ids.append(data["edge_id"])
        distance += data["length_m"]
        weight += data["weight"]
    return RouteResult(node_ids, edge_ids, round(weight, 2), True, [], round(distance, 1))


def blocked_edges_on_static_route(
    world: World, origin: str, target: str, closed_edges: set[str], travel_factor: float = 1.0
) -> RouteResult:
    """Return the optimistic route plus the hazard closures that invalidate it."""

    optimistic = static_route(world, origin, target, travel_factor)
    if not optimistic.reachable:
        return optimistic
    blocked = [edge_id for edge_id in optimistic.edge_ids if edge_id in closed_edges]
    return RouteResult(
        node_ids=optimistic.node_ids,
        edge_ids=optimistic.edge_ids,
        travel_min=optimistic.travel_min,
        reachable=not blocked,
        blocked_edge_ids=blocked,
        distance_m=optimistic.distance_m,
    )


def weather_factor(scenario: ScenarioConfig) -> float:
    rainfall = scenario.weather.rainfall_mm_h / 95.0
    wind = scenario.weather.wind_kph / 170.0
    visibility = max(0.0, (8.0 - scenario.weather.visibility_km) / 10.0)
    return round(1.0 + rainfall + wind + visibility, 3)
