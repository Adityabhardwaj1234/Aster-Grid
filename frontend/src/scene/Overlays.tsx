import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

import {
  circlePoints,
  districtCenter,
  edgePoints,
  routePoints,
  scenePoint,
} from '../lib/sceneMath';
import type { ViewPreset } from '../lib/viewPresets';
import type {
  AllocationProposal,
  Assignment,
  Demand,
  Facility,
  RoadEdge,
  ScenarioConfig,
  SimulationResult,
  Snapshot,
  World,
} from '../types';
import type { EntitySelection } from '../store/useAppStore';
import labels from './SceneLabels.module.css';

function pointerOver(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation();
  document.body.style.cursor = 'pointer';
}

function pointerOut() {
  document.body.style.cursor = 'default';
}

interface LabelProps {
  position: [number, number, number];
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'affected' | 'selected' | 'danger' | 'muted';
  compact?: boolean;
}

function MapLabel({ position, children, onClick, tone = 'default', compact }: LabelProps) {
  return (
    <Html
      position={position}
      center
      distanceFactor={20}
      zIndexRange={[20, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <button
        type="button"
        className={`${labels.label} ${labels[tone] ?? ''} ${compact ? labels.compact : ''}`}
        style={{ pointerEvents: onClick ? 'auto' : 'none' }}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
        tabIndex={onClick ? 0 : -1}
      >
        {children}
      </button>
    </Html>
  );
}

/* ---------------------------------------------------------------- districts */

export function DistrictOutlines({
  world,
  heights,
  preset,
  scenario,
  visible,
  labelsVisible,
  selectedId,
  onSelect,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  scenario: ScenarioConfig;
  visible: boolean;
  labelsVisible: boolean;
  selectedId: string | null;
  onSelect: (selection: EntitySelection) => void;
}) {
  if (!visible) return null;
  const affected = new Set(scenario.affected_district_ids);
  return (
    <group>
      {world.districts.map((district) => {
        const points = district.polygon.map((point) => scenePoint(world, heights, point, 0.28));
        points.push(points[0]);
        const active = affected.has(district.id);
        const selected = district.id === selectedId;
        const center = districtCenter(world, heights, district.centroid, 1.15);
        const color = selected
          ? preset.palette.validated
          : active
            ? preset.palette.degraded
            : preset.palette.contourMinor;
        return (
          <group key={district.id}>
            <Line
              points={points}
              color={color}
              lineWidth={selected ? 1.8 : active ? 1.1 : 0.6}
              transparent
              opacity={selected ? 0.95 : active ? 0.55 : 0.25}
              depthWrite={false}
            />
            {labelsVisible ? (
              <MapLabel
                position={[center[0], center[1] + 1.1, center[2]]}
                tone={selected ? 'selected' : active ? 'affected' : 'muted'}
                compact
                onClick={() =>
                  onSelect({
                    kind: 'district',
                    id: district.id,
                    label: district.name,
                    detail: `${district.id} · ${Math.round(district.risk_base * 100)}% base risk`,
                    position: center,
                  })
                }
              >
                <span className={labels.labelId}>{district.id}</span>
                <span>{district.name}</span>
              </MapLabel>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ network */

export function RoadNetwork({
  world,
  heights,
  preset,
  snapshot,
  closedEdges,
  visible,
  labelsVisible,
  selectedId,
  onSelect,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  snapshot: Snapshot | null;
  closedEdges: Set<string>;
  visible: boolean;
  labelsVisible: boolean;
  selectedId: string | null;
  onSelect: (selection: EntitySelection) => void;
}) {
  if (!visible) return null;
  const states = new Map(snapshot?.roads.map((road) => [road.edge_id, road.status]) ?? []);
  const selectedEdgeId = selectedId;
  return (
    <group>
      {world.edges.map((edge) => {
        const points = edgePoints(world, heights, edge, edge.bridge ? 0.34 : 0.24);
        if (points.length < 2) return null;
        const current = states.get(edge.id);
        const status = current ?? (closedEdges.has(edge.id) ? 'closed' : 'open');
        const color =
          status === 'closed'
            ? preset.palette.closed
            : status === 'degraded'
              ? preset.palette.degraded
              : edge.bridge
                ? preset.palette.bridge
                : preset.palette.roadMuted;
        const selected = selectedEdgeId === edge.id;
        return (
          <group key={edge.id}>
            <Line
              points={points}
              color={selected ? preset.palette.validated : color}
              lineWidth={selected ? 2.2 : edge.bridge ? 1.25 : 0.62}
              transparent
              opacity={status === 'open' && !edge.bridge ? 0.42 : 0.88}
              depthWrite={false}
              onPointerOver={pointerOver}
              onPointerOut={pointerOut}
              onClick={(event) => {
                event.stopPropagation();
                onSelect({
                  kind: edge.bridge ? 'bridge' : 'edge',
                  id: edge.id,
                  label: edge.label || edge.id,
                  detail: edge.bridge ? 'Controlled river crossing' : `${edge.length_m} m road segment`,
                  position: points[Math.floor(points.length / 2)],
                });
              }}
            />
            <Line
              points={points}
              color={preset.palette.validated}
              lineWidth={7}
              transparent
              opacity={0.001}
              depthWrite={false}
              onClick={(event) => {
                event.stopPropagation();
                onSelect({
                  kind: edge.bridge ? 'bridge' : 'edge',
                  id: edge.id,
                  label: edge.label || edge.id,
                  detail: edge.bridge ? 'Controlled river crossing' : `${edge.length_m} m road segment`,
                  position: points[Math.floor(points.length / 2)],
                });
              }}
            />
          </group>
        );
      })}
      {world.edges
        .filter((edge) => edge.bridge)
        .map((edge) => {
          const points = edgePoints(world, heights, edge, 0.62);
          const position = points[Math.floor(points.length / 2)];
          const closed = (states.get(edge.id) ?? (closedEdges.has(edge.id) ? 'closed' : 'open')) === 'closed';
          return (
            <group key={`${edge.id}-marker`} position={position}>
              <mesh rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.45, 0.52, 32]} />
                <meshBasicMaterial
                  color={closed ? preset.palette.closed : preset.palette.bridge}
                  transparent
                  opacity={0.8}
                  depthWrite={false}
                />
              </mesh>
              {labelsVisible ? (
                <MapLabel
                  position={[0, 0.55, 0]}
                  tone={closed ? 'danger' : 'affected'}
                  compact
                  onClick={() =>
                    onSelect({
                      kind: 'bridge',
                      id: edge.id,
                      label: edge.label || edge.id,
                      detail: closed ? 'Projected closed' : `Clearance ${edge.clearance_m ?? '—'} m`,
                      position,
                    })
                  }
                >
                  {edge.id}
                </MapLabel>
              ) : null}
            </group>
          );
        })}
    </group>
  );
}

/* ------------------------------------------------------------------- routes */

interface RouteLineProps {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  assignment: Assignment;
  color: string;
  width: number;
  dashed: boolean;
  glow?: boolean;
  selected: boolean;
  onSelect: () => void;
}

function RouteLine({
  world,
  heights,
  preset,
  assignment,
  color,
  width,
  dashed,
  glow = false,
  selected,
  onSelect,
}: RouteLineProps) {
  const points = useMemo(
    () =>
      routePoints(
        world,
        heights,
        assignment.route_edge_ids,
        assignment.origin_node_id,
        0.5,
      ),
    [world, heights, assignment],
  );
  if (points.length < 2) return null;
  const middle = points[Math.floor(points.length / 2)];
  return (
    <group>
      {glow ? (
        <Line
          points={points}
          color={color}
          lineWidth={width + 5}
          transparent
          opacity={0.09}
          depthWrite={false}
        />
      ) : null}
      <Line
        points={points}
        color={selected ? preset.palette.facility : color}
        lineWidth={selected ? width + 1.2 : width}
        dashed={dashed}
        dashSize={1.25}
        gapSize={0.65}
        transparent
        opacity={0.92}
        depthWrite={false}
        onPointerOver={pointerOver}
        onPointerOut={pointerOut}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      />
      <Line
        points={points}
        color={color}
        lineWidth={7}
        transparent
        opacity={0.001}
        depthWrite={false}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      />
      <mesh position={middle}>
        <sphereGeometry args={[0.075, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function RouteNetwork({
  world,
  heights,
  preset,
  scenario,
  simulation,
  finalProposal,
  initialProposal,
  rejectedAssignments,
  snapshot,
  layersRoutes,
  layersProposed,
  selectedId,
  onSelect,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  scenario: ScenarioConfig;
  simulation: SimulationResult | null;
  finalProposal: AllocationProposal | null;
  initialProposal: AllocationProposal | null;
  rejectedAssignments: Set<string>;
  snapshot: Snapshot | null;
  layersRoutes: boolean;
  layersProposed: boolean;
  selectedId: string | null;
  onSelect: (selection: EntitySelection) => void;
}) {
  if (!layersRoutes) return null;
  const assignmentMap = new Map(
    (finalProposal?.assignments ?? []).map((assignment) => [assignment.id, assignment]),
  );
  const demandLabel = new Map(world.demands.map((demand) => [demand.id, demand.label]));
  const finalAssignments = simulation
    ? simulation.routes
        .map((route) => assignmentMap.get(route.assignment_id))
        .filter((assignment): assignment is Assignment => Boolean(assignment))
    : (finalProposal?.assignments ?? []);
  const finalIds = new Set(finalAssignments.map((assignment) => assignment.id));
  const routeState = new Map(simulation?.routes.map((route) => [route.assignment_id, route.state]) ?? []);
  const initialAssignments = initialProposal?.assignments ?? finalProposal?.assignments ?? [];
  const hasValidated = Boolean(simulation?.routes.length);

  return (
    <group>
      {finalAssignments.map((assignment) => {
        const state = hasValidated ? routeState.get(assignment.id) ?? 'validated' : 'proposed';
        const rejected = rejectedAssignments.has(assignment.id);
        const color = hasValidated
          ? state === 'validated'
            ? preset.palette.validated
            : state === 'rejected' || state === 'blocked'
              ? preset.palette.rejected
              : preset.palette.proposed
          : rejected
            ? preset.palette.rejected
            : preset.palette.proposed;
        return (
          <RouteLine
            key={assignment.id}
            world={world}
            heights={heights}
            preset={preset}
            assignment={assignment}
            color={color}
            width={hasValidated ? 2.3 : 1.45}
            dashed={!hasValidated}
            glow={hasValidated}
            selected={selectedId === assignment.id}
            onSelect={() =>
              onSelect({
                kind: 'route',
                id: assignment.id,
                label: `Route · ${demandLabel.get(assignment.demand_id) ?? assignment.demand_id}`,
                detail: `${assignment.asset_id} · ${assignment.start_min}–${assignment.end_min} min · ${state}`,
                position: routePoints(
                  world,
                  heights,
                  assignment.route_edge_ids,
                  assignment.origin_node_id,
                  0.5,
                )[0],
              })
            }
          />
        );
      })}

      {layersProposed && hasValidated
        ? initialAssignments.map((assignment) => {
            const final = finalAssignments.find((candidate) => candidate.id === assignment.id);
            const same =
              final &&
              final.route_edge_ids.join('|') === assignment.route_edge_ids.join('|');
            if (same && !rejectedAssignments.has(assignment.id)) return null;
            const rejected = rejectedAssignments.has(assignment.id);
            return (
              <RouteLine
                key={`ghost-${assignment.id}`}
                world={world}
                heights={heights}
                preset={preset}
                assignment={assignment}
                color={rejected ? preset.palette.rejected : preset.palette.proposed}
                width={1.2}
                dashed
                selected={false}
                onSelect={() =>
                  onSelect({
                    kind: 'route',
                    id: assignment.id,
                    label: `Proposed route · ${demandLabel.get(assignment.demand_id) ?? assignment.demand_id}`,
                    detail: `${rejected ? 'Rejected by preflight' : 'Superseded by revision'} · ${assignment.asset_id}`,
                    position: routePoints(
                      world,
                      heights,
                      assignment.route_edge_ids,
                      assignment.origin_node_id,
                      0.5,
                    )[0],
                  })
                }
              />
            );
          })
        : null}

      {!hasValidated && layersProposed
        ? initialAssignments
            .filter((assignment) => !finalIds.has(assignment.id))
            .map((assignment) => (
              <RouteLine
                key={`proposal-${assignment.id}`}
                world={world}
                heights={heights}
                preset={preset}
                assignment={assignment}
                color={
                  rejectedAssignments.has(assignment.id)
                    ? preset.palette.rejected
                    : preset.palette.proposed
                }
                width={1.2}
                dashed
                selected={false}
                onSelect={() =>
                  onSelect({
                    kind: 'route',
                    id: assignment.id,
                    label: `Proposed route · ${demandLabel.get(assignment.demand_id) ?? assignment.demand_id}`,
                    detail: `${assignment.asset_id} · ${assignment.status}`,
                    position: routePoints(
                      world,
                      heights,
                      assignment.route_edge_ids,
                      assignment.origin_node_id,
                      0.5,
                    )[0],
                  })
                }
              />
            ))
        : null}
    </group>
  );
}

/* ---------------------------------------------------------------- facilities */

const facilityColor = (facility: Facility, preset: ViewPreset): string => {
  switch (facility.type) {
    case 'hospital':
      return preset.palette.assetMedical;
    case 'shelter':
      return preset.palette.demandMet;
    case 'depot':
      return preset.palette.assetSupply;
    case 'command':
      return preset.palette.accent;
    case 'relay':
      return preset.palette.assetDrone;
    default:
      return preset.palette.assetDrone;
  }
};

export function FacilityMarkers({
  world,
  heights,
  preset,
  visible,
  labelsVisible,
  selectedId,
  onSelect,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  visible: boolean;
  labelsVisible: boolean;
  selectedId: string | null;
  onSelect: (selection: EntitySelection) => void;
}) {
  if (!visible) return null;
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  return (
    <group>
      {world.facilities.map((facility) => {
        const node = nodes.get(facility.node_id);
        if (!node) return null;
        const position = scenePoint(world, heights, [node.x, node.z], 0.38);
        const color = facilityColor(facility, preset);
        const selected = selectedId === facility.id;
        return (
          <group
            key={facility.id}
            position={position}
            onPointerOver={pointerOver}
            onPointerOut={pointerOut}
            onClick={(event) => {
              event.stopPropagation();
              onSelect({
                kind: 'facility',
                id: facility.id,
                label: facility.name,
                detail: `${facility.type} · capacity ${facility.capacity}`,
                position,
              });
            }}
          >
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.38, 0.44, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
            </mesh>
            {facility.type === 'hospital' ? (
              <group position-y={0.45}>
                <mesh>
                  <boxGeometry args={[0.46, 0.16, 0.16]} />
                  <meshBasicMaterial color={color} />
                </mesh>
                <mesh>
                  <boxGeometry args={[0.16, 0.46, 0.16]} />
                  <meshBasicMaterial color={color} />
                </mesh>
              </group>
            ) : facility.type === 'depot' ? (
              <mesh position-y={0.38}>
                <cylinderGeometry args={[0.24, 0.24, 0.32, 8]} />
                <meshBasicMaterial color={color} />
              </mesh>
            ) : facility.type === 'command' ? (
              <mesh position-y={0.4} rotation-y={Math.PI / 4}>
                <boxGeometry args={[0.3, 0.48, 0.3]} />
                <meshBasicMaterial color={color} />
              </mesh>
            ) : (
              <mesh position-y={0.34}>
                <octahedronGeometry args={[0.26, 0]} />
                <meshBasicMaterial color={color} />
              </mesh>
            )}
            {selected ? <mesh position-y={0.02} rotation-x={-Math.PI / 2}><ringGeometry args={[0.55, 0.6, 32]} /><meshBasicMaterial color={preset.palette.facility} /></mesh> : null}
            {labelsVisible ? (
              <MapLabel
                position={[0, 0.95, 0]}
                tone={selected ? 'selected' : 'default'}
                onClick={() =>
                  onSelect({
                    kind: 'facility',
                    id: facility.id,
                    label: facility.name,
                    detail: `${facility.type} · capacity ${facility.capacity}`,
                    position,
                  })
                }
              >
                <span className={labels.labelId}>{facility.id}</span>
                <span>{facility.name}</span>
              </MapLabel>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/* -------------------------------------------------------------------- assets */

function assetColor(status: string, preset: ViewPreset): string {
  switch (status) {
    case 'complete':
      return preset.palette.demandMet;
    case 'serving':
      return preset.palette.demand;
    case 'en_route':
      return preset.palette.assetRescue;
    case 'blocked':
    case 'failed':
      return preset.palette.rejected;
    default:
      return preset.palette.road;
  }
}

function AssetBody({ type }: { type: string }) {
  if (type === 'medical') return <octahedronGeometry args={[0.28, 0]} />;
  if (type === 'supply') return <boxGeometry args={[0.34, 0.28, 0.34]} />;
  if (type === 'drone') return <octahedronGeometry args={[0.2, 0]} />;
  return <coneGeometry args={[0.22, 0.5, 4]} />;
}

function AssetMarker({
  id,
  callsign,
  type,
  position,
  status,
  preset,
  selected,
  labelsVisible,
  onSelect,
  reduceMotion,
}: {
  id: string;
  callsign: string;
  type: string;
  position: [number, number, number];
  status: string;
  preset: ViewPreset;
  selected: boolean;
  labelsVisible: boolean;
  onSelect: (selection: EntitySelection) => void;
  reduceMotion: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...position), [position]);
  const [hovered, setHovered] = useState(false);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (reduceMotion) {
      ref.current.position.copy(target);
      return;
    }
    const factor = 1 - Math.exp(-delta * 7);
    ref.current.position.lerp(target, factor);
  });
  const color = assetColor(status, preset);
  return (
    <group
      ref={ref}
      position={position}
      onPointerOver={(event) => {
        pointerOver(event);
        setHovered(true);
      }}
      onPointerOut={() => {
        pointerOut();
        setHovered(false);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect({
          kind: 'asset',
          id,
          label: callsign,
          detail: `${type} · ${status}`,
          position,
        });
      }}
    >
      <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
        <ringGeometry args={[0.25, 0.3, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
      </mesh>
      <mesh position-y={0.28}>
        <AssetBody type={type} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position-y={0.08}>
        <cylinderGeometry args={[0.015, 0.015, 0.2, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {selected || hovered ? (
        <mesh position-y={0.04} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.4, 0.45, 32]} />
          <meshBasicMaterial color={preset.palette.facility} transparent opacity={0.9} />
        </mesh>
      ) : null}
      {labelsVisible ? (
        <MapLabel
          position={[0, 0.8, 0]}
          tone={selected || hovered ? 'selected' : 'default'}
          compact
          onClick={() =>
            onSelect({
              kind: 'asset',
              id,
              label: callsign,
              detail: `${type} · ${status}`,
              position,
            })
          }
        >
          {callsign}
        </MapLabel>
      ) : null}
    </group>
  );
}

export function AssetMarkers({
  world,
  heights,
  preset,
  snapshot,
  visible,
  labelsVisible,
  selectedId,
  onSelect,
  reduceMotion,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  snapshot: Snapshot | null;
  visible: boolean;
  labelsVisible: boolean;
  selectedId: string | null;
  onSelect: (selection: EntitySelection) => void;
  reduceMotion: boolean;
}) {
  if (!visible) return null;
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  const states = new Map(snapshot?.assets.map((asset) => [asset.id, asset]) ?? []);
  return (
    <group>
      {world.assets.map((asset) => {
        const state = states.get(asset.id);
        const node = nodes.get(asset.home_node_id);
        const x = state?.x ?? node?.x ?? world.map_size_m / 2;
        const z = state?.z ?? node?.z ?? world.map_size_m / 2;
        const position = scenePoint(world, heights, [x, z], 0.32);
        return (
          <AssetMarker
            key={asset.id}
            id={asset.id}
            callsign={asset.callsign}
            type={asset.type}
            position={position}
            status={state?.status ?? 'staged'}
            preset={preset}
            selected={selectedId === asset.id}
            labelsVisible={labelsVisible}
            onSelect={onSelect}
            reduceMotion={reduceMotion}
          />
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------- demands */

export function DemandMarkers({
  world,
  heights,
  preset,
  scenario,
  snapshot,
  simulation,
  visible,
  labelsVisible,
  selectedId,
  onSelect,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  scenario: ScenarioConfig;
  snapshot: Snapshot | null;
  simulation: SimulationResult | null;
  visible: boolean;
  labelsVisible: boolean;
  selectedId: string | null;
  onSelect: (selection: EntitySelection) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!visible) return null;
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  const currentTime = snapshot?.sim_time_min ?? 0;
  const done = new Set<string>();
  if (simulation) {
    for (const event of simulation.events) {
      if (event.kind !== 'task_completed' || event.t_min > currentTime) continue;
      for (const entityId of event.entity_ids) {
        if (world.demands.some((demand) => demand.id === entityId)) done.add(entityId);
      }
    }
  }
  return (
    <group>
      {world.demands.map((demand) => {
        const node = nodes.get(demand.node_id);
        if (!node) return null;
        const position = scenePoint(world, heights, [node.x, node.z], 0.42);
        const complete = done.has(demand.id);
        const overdue = !complete && currentTime > demand.window_end_min;
        const affected = scenario.affected_district_ids.includes(demand.district_id);
        const color = complete
          ? preset.palette.demandMet
          : overdue
            ? preset.palette.rejected
            : affected
              ? preset.palette.demand
              : preset.palette.road;
        const selected = selectedId === demand.id;
        return (
          <group
            key={demand.id}
            position={position}
            onPointerOver={(event) => {
              pointerOver(event);
              setHovered(demand.id);
            }}
            onPointerOut={() => {
              pointerOut();
              setHovered(null);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect({
                kind: 'demand',
                id: demand.id,
                label: demand.label,
                detail: `${demand.kind} · ${demand.quantity} ${demand.unit} · ${demand.window_start_min}–${demand.window_end_min} min`,
                position,
              });
            }}
          >
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.2, 0.25, 20]} />
              <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
            </mesh>
            <mesh position-y={0.22} rotation-y={Math.PI / 4}>
              <octahedronGeometry args={[0.17, 0]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {selected ? (
              <mesh position-y={0.02} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.33, 0.38, 24]} />
                <meshBasicMaterial color={preset.palette.facility} />
              </mesh>
            ) : null}
            {labelsVisible && (hovered === demand.id || selected) ? (
              <MapLabel position={[0, 0.62, 0]} tone="default" compact>
                {demand.label} · {demand.priority}
              </MapLabel>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/* -------------------------------------------------------------------- trails */

export function AssetTrails({
  world,
  heights,
  preset,
  snapshot,
  visible,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  snapshot: Snapshot | null;
  visible: boolean;
}) {
  if (!visible || !snapshot) return null;
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  return (
    <group>
      {world.assets.map((asset) => {
        const state = snapshot.assets.find((candidate) => candidate.id === asset.id);
        const home = nodes.get(asset.home_node_id);
        if (!state || !home) return null;
        if (!['en_route', 'serving', 'complete'].includes(state.status)) return null;
        const points = [
          scenePoint(world, heights, [home.x, home.z], 0.35),
          scenePoint(world, heights, [state.x, state.z], 0.35),
        ];
        return (
          <Line
            key={asset.id}
            points={points}
            color={preset.palette.assetRescue}
            lineWidth={0.55}
            dashed
            dashSize={0.8}
            gapSize={0.75}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        );
      })}
    </group>
  );
}

/* ----------------------------------------------------------------- coverage */

export function CoverageOverlay({
  world,
  heights,
  preset,
  visible,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  visible: boolean;
}) {
  if (!visible) return null;
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  return (
    <group>
      {world.facilities.map((facility) => {
        const node = nodes.get(facility.node_id);
        if (!node) return null;
        const radius = 900 + facility.capacity * 3;
        const points = circlePoints(world, heights, [node.x, node.z], radius, 64, 0.3);
        return (
          <Line
            key={facility.id}
            points={points}
            color={preset.palette.demandMet}
            lineWidth={0.55}
            dashed
            dashSize={1.3}
            gapSize={1.5}
            transparent
            opacity={0.2}
            depthWrite={false}
          />
        );
      })}
    </group>
  );
}

/* ----------------------------------------------------------------- selection */

export function SelectionReticle({
  position,
  color,
  reduceMotion,
}: {
  position: [number, number, number];
  color: string;
  reduceMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (!group.current || reduceMotion) return;
    group.current.rotation.z = state.clock.elapsedTime * 0.4;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.04;
    group.current.scale.setScalar(pulse);
    void delta;
  });
  return (
    <group ref={group} position={position}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.66, 0.7, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.88, 0.895, 4, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh position-y={0.6}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export function getEdgeMidpoint(
  world: World,
  heights: Int16Array,
  edge: RoadEdge,
): [number, number, number] {
  const points = edgePoints(world, heights, edge, 0.5);
  return points[Math.floor(points.length / 2)] ?? [0, 0, 0];
}

export function getDemandPosition(
  world: World,
  heights: Int16Array,
  demand: Demand,
): [number, number, number] {
  const node = world.nodes.find((candidate) => candidate.id === demand.node_id);
  return scenePoint(world, heights, [node?.x ?? 0, node?.z ?? 0], 0.5);
}
