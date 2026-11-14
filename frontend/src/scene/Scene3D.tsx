import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import {
  QUALITY_DPR,
  type QualityLevel,
  type ViewPreset,
  type CameraPose,
} from '../lib/viewPresets';
import { sceneScale } from '../lib/sceneMath';
import type {
  AllocationProposal,
  ScenarioConfig,
  SimulationResult,
  Snapshot,
  World,
} from '../types';
import type { EntitySelection, LayerState } from '../store/useAppStore';
import {
  AssetMarkers,
  AssetTrails,
  CoverageOverlay,
  DemandMarkers,
  DistrictOutlines,
  FacilityMarkers,
  RoadNetwork,
  RouteNetwork,
  SelectionReticle,
} from './Overlays';
import {
  BaseSlab,
  FirePerimeter,
  RiverLine,
  Terrain,
  Water,
  Weather,
} from './Terrain';

interface ControlsLike {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function scaledPose(pose: CameraPose, scale: number): CameraPose {
  return {
    position: [pose.position[0] * scale, pose.position[1] * scale, pose.position[2] * scale],
    target: [pose.target[0] * scale, pose.target[1], pose.target[2] * scale],
    fov: pose.fov,
  };
}

function CameraRig({
  preset,
  mapScale,
  focusPoint,
  focusNonce,
  resetNonce,
  reduceMotion,
}: {
  preset: ViewPreset;
  mapScale: number;
  focusPoint?: [number, number, number];
  focusNonce: number;
  resetNonce: number;
  reduceMotion: boolean;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const controls = useThree((state) => state.controls) as unknown as ControlsLike | null;
  const initial = scaledPose(preset.camera, mapScale);
  const goalPosition = useRef(new THREE.Vector3(...initial.position));
  const goalTarget = useRef(new THREE.Vector3(...initial.target));
  const goalFov = useRef(preset.camera.fov);
  const animating = useRef(true);

  useEffect(() => {
    const pose = scaledPose(preset.camera, mapScale);
    goalPosition.current.set(...pose.position);
    goalTarget.current.set(...pose.target);
    goalFov.current = pose.fov;
    animating.current = true;
  }, [mapScale, preset.camera.fov, preset.camera.position, preset.camera.target, resetNonce]);

  useEffect(() => {
    if (!focusNonce || !focusPoint) return;
    const point = new THREE.Vector3(...focusPoint);
    const currentDistance = camera.position.distanceTo(controls?.target ?? point);
    const distance = Math.min(30 * mapScale, Math.max(12 * mapScale, currentDistance * 0.58));
    const direction = camera.position
      .clone()
      .sub(controls?.target ?? new THREE.Vector3(0, 0, 0));
    if (direction.lengthSq() < 0.001) direction.set(1, 0.8, 1);
    direction.setLength(distance);
    goalTarget.current.copy(point);
    goalPosition.current.copy(point).add(direction);
    animating.current = true;
  }, [camera.position, controls, focusNonce, focusPoint, mapScale]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      animating.current = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, delta) => {
    if (!animating.current) return;
    const factor = reduceMotion ? 1 : 1 - Math.exp(-delta * 5.2);
    camera.position.lerp(goalPosition.current, factor);
    if (controls) {
      controls.target.lerp(goalTarget.current, factor);
      controls.update();
    } else {
      camera.lookAt(goalTarget.current);
    }
    if (Math.abs(goalFov.current - camera.fov) > 0.01) {
      camera.fov += (goalFov.current - camera.fov) * factor;
      camera.updateProjectionMatrix();
    }
    if (camera.position.distanceTo(goalPosition.current) < 0.03) {
      animating.current = false;
    }
  });

  return null;
}

function Scene({
  world,
  heights,
  scenario,
  snapshot,
  simulation,
  finalProposal,
  initialProposal,
  rejectedAssignments,
  closedEdges,
  preset,
  mapScale,
  lighting,
  layers,
  selection,
  onSelect,
  focusNonce,
  resetNonce,
  reduceMotion,
}: {
  world: World;
  heights: Int16Array;
  scenario: ScenarioConfig;
  snapshot: Snapshot | null;
  simulation: SimulationResult | null;
  finalProposal: AllocationProposal | null;
  initialProposal: AllocationProposal | null;
  rejectedAssignments: Set<string>;
  closedEdges: Set<string>;
  preset: ViewPreset;
  mapScale: number;
  lighting: 'auto' | 'day' | 'night';
  layers: LayerState;
  selection: EntitySelection | null;
  onSelect: (selection: EntitySelection | null) => void;
  focusNonce: number;
  resetNonce: number;
  reduceMotion: boolean;
}) {
  const palette = preset.palette;
  const scheduledNight = scenario.start_hour < 7 || scenario.start_hour >= 19;
  const night =
    palette.night && (lighting === 'night' || (lighting === 'auto' && scheduledNight));
  const focusPoint = selection?.position;

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fogExp2 attach="fog" args={[palette.fog, palette.fogDensity]} />
      <ambientLight
        intensity={palette.ambient * (night ? 0.62 : 1.15)}
        color={night ? '#607f9c' : '#c4eaf2'}
      />
      <hemisphereLight
        args={[palette.high, palette.low, night ? 0.24 : 0.5]}
      />
      <directionalLight
        position={[-28 * mapScale, 42 * mapScale, 24 * mapScale]}
        intensity={palette.key * (night ? 0.42 : 1.1)}
        color={night ? '#94caff' : '#fff1d7'}
      />
      <directionalLight
        position={[32 * mapScale, 18 * mapScale, -36 * mapScale]}
        intensity={palette.rim * (night ? 0.7 : 0.55)}
        color={palette.accent}
      />
      <pointLight
        position={[18 * mapScale, 10 * mapScale, -20 * mapScale]}
        intensity={night ? 0.6 : 0.18}
        distance={80 * mapScale}
        color={palette.accent}
      />

      <BaseSlab world={world} preset={preset} />
      <Terrain world={world} heights={heights} preset={preset} riskVisible={layers.risk} />
      <Water world={world} heights={heights} snapshot={snapshot} preset={preset} />
      {world.hazard.kind !== 'flood' ? (
        <RiverLine world={world} heights={heights} preset={preset} />
      ) : null}
      <FirePerimeter world={world} heights={heights} snapshot={snapshot} preset={preset} />

      <RoadNetwork
        world={world}
        heights={heights}
        preset={preset}
        snapshot={snapshot}
        closedEdges={closedEdges}
        visible
        labelsVisible={layers.labels}
        selectedId={
          selection && (selection.kind === 'edge' || selection.kind === 'bridge')
            ? selection.id
            : null
        }
        onSelect={onSelect}
      />
      <CoverageOverlay world={world} heights={heights} preset={preset} visible={layers.coverage} />
      <DistrictOutlines
        world={world}
        heights={heights}
        preset={preset}
        scenario={scenario}
        visible={layers.districts}
        labelsVisible={layers.labels}
        selectedId={selection?.kind === 'district' ? selection.id : null}
        onSelect={onSelect}
      />
      <RouteNetwork
        world={world}
        heights={heights}
        preset={preset}
        scenario={scenario}
        simulation={simulation}
        finalProposal={finalProposal}
        initialProposal={initialProposal}
        rejectedAssignments={rejectedAssignments}
        snapshot={snapshot}
        layersRoutes={layers.routes}
        layersProposed={layers.proposed}
        selectedId={selection?.kind === 'route' ? selection.id : null}
        onSelect={onSelect}
      />
      <AssetTrails
        world={world}
        heights={heights}
        preset={preset}
        snapshot={snapshot}
        visible={layers.trails}
      />
      <AssetMarkers
        world={world}
        heights={heights}
        preset={preset}
        snapshot={snapshot}
        visible={layers.assets}
        labelsVisible={layers.labels}
        selectedId={selection?.kind === 'asset' ? selection.id : null}
        onSelect={onSelect}
        reduceMotion={reduceMotion}
      />
      <FacilityMarkers
        world={world}
        heights={heights}
        preset={preset}
        visible={layers.facilities}
        labelsVisible={layers.labels}
        selectedId={selection?.kind === 'facility' ? selection.id : null}
        onSelect={onSelect}
      />
      <DemandMarkers
        world={world}
        heights={heights}
        preset={preset}
        scenario={scenario}
        snapshot={snapshot}
        simulation={simulation}
        visible
        labelsVisible={layers.labels}
        selectedId={selection?.kind === 'demand' ? selection.id : null}
        onSelect={onSelect}
      />
      <Weather
        world={world}
        scenario={scenario}
        preset={preset}
        snapshot={snapshot}
        visible={layers.weather}
      />
      {selection?.position ? (
        <SelectionReticle
          position={selection.position}
          color={palette.accent}
          reduceMotion={reduceMotion}
        />
      ) : null}

      <CameraRig
        preset={preset}
        mapScale={mapScale}
        focusPoint={focusPoint}
        focusNonce={focusNonce}
        resetNonce={resetNonce}
        reduceMotion={reduceMotion}
      />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.065}
        minDistance={8 * mapScale}
        maxDistance={130 * mapScale}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2.06}
        enablePan
        panSpeed={0.55}
        rotateSpeed={0.45}
        zoomSpeed={0.7}
        autoRotate={preset.autoRotate && !reduceMotion}
        autoRotateSpeed={0.28}
      />
    </>
  );
}

export default function Scene3D({
  world,
  heights,
  scenario,
  snapshot,
  simulation,
  finalProposal,
  initialProposal,
  rejectedAssignments,
  closedEdges,
  preset,
  quality,
  lighting,
  layers,
  selection,
  onSelect,
  focusNonce,
  resetNonce,
  reduceMotion,
  active,
}: {
  world: World;
  heights: Int16Array;
  scenario: ScenarioConfig;
  snapshot: Snapshot | null;
  simulation: SimulationResult | null;
  finalProposal: AllocationProposal | null;
  initialProposal: AllocationProposal | null;
  rejectedAssignments: Set<string>;
  closedEdges: Set<string>;
  preset: ViewPreset;
  quality: QualityLevel;
  lighting: 'auto' | 'day' | 'night';
  layers: LayerState;
  selection: EntitySelection | null;
  onSelect: (selection: EntitySelection | null) => void;
  focusNonce: number;
  resetNonce: number;
  reduceMotion: boolean;
  active: boolean;
}) {
  const mapScale = sceneScale(world);
  const pose = useMemo(() => scaledPose(preset.camera, mapScale), [mapScale, preset.camera]);
  const camera = useMemo(
    () => ({
      position: pose.position,
      fov: pose.fov,
      near: 0.1,
      far: 420 * mapScale,
    }),
    [mapScale, pose],
  );

  return (
    <Canvas
      className="scene-canvas"
      flat
      frameloop={active ? 'always' : 'never'}
      dpr={QUALITY_DPR[quality]}
      camera={camera}
      gl={{
        antialias: quality !== 'low',
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      performance={{ min: 0.6 }}
      role="img"
      aria-label={`3D terrain of ${world.title}, ${world.districts.length} districts, ${world.assets.length} assets, rendered in ${preset.name} mode.`}
      onPointerMissed={() => onSelect(null)}
    >
      <Suspense fallback={null}>
        <Scene
          world={world}
          heights={heights}
          scenario={scenario}
          snapshot={snapshot}
          simulation={simulation}
          finalProposal={finalProposal}
          initialProposal={initialProposal}
          rejectedAssignments={rejectedAssignments}
          closedEdges={closedEdges}
          preset={preset}
          mapScale={mapScale}
          lighting={lighting}
          layers={layers}
          selection={selection}
          onSelect={onSelect}
          focusNonce={focusNonce}
          resetNonce={resetNonce}
          reduceMotion={reduceMotion}
        />
      </Suspense>
    </Canvas>
  );
}
