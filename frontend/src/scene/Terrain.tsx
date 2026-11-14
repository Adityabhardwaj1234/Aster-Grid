import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Line } from '@react-three/drei';
import * as THREE from 'three';

import {
  HEIGHT_TO_SCENE,
  buildTerrainGeometry,
  circlePoints,
  riskTextureData,
  scenePoint,
  sceneSize,
} from '../lib/sceneMath';
import type { ViewPreset } from '../lib/viewPresets';
import type { ScenarioConfig, Snapshot, World } from '../types';

const terrainVertex = `
  uniform float uMinElev;
  uniform float uMaxElev;
  varying float vElev;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying float vFogDepth;

  void main() {
    vElev = position.y;
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const terrainFragment = `
  uniform vec3 uLow;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uContour;
  uniform vec3 uContourMinor;
  uniform vec3 uAccent;
  uniform vec3 uFogColor;
  uniform float uMinElev;
  uniform float uMaxElev;
  uniform float uContourInterval;
  uniform float uContourOpacity;
  uniform float uFogDensity;

  varying float vElev;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying float vFogDepth;

  float contourBand(float elevation, float interval, float width) {
    float value = elevation / interval;
    float distanceToLine = abs(fract(value) - 0.5);
    float feather = fwidth(value) * width;
    return 1.0 - smoothstep(0.0, feather, distanceToLine);
  }

  void main() {
    float t = clamp((vElev - uMinElev) / max(0.0001, uMaxElev - uMinElev), 0.0, 1.0);
    vec3 base = mix(uLow, uMid, smoothstep(0.0, 0.48, t));
    base = mix(base, uHigh, smoothstep(0.48, 1.0, t));

    vec3 normal = normalize(vNormalView);
    vec3 lightDirection = normalize(vec3(-0.5, 0.9, 0.45));
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
    float shade = 0.46 + diffuse * 0.7;
    vec3 color = base * shade;
    color += uAccent * pow(diffuse, 3.0) * 0.18;
    color *= 1.0 - slope * 0.2;

    float majorLine = contourBand(vElev, uContourInterval, 1.25);
    float minorLine = contourBand(vElev, max(0.15, uContourInterval / 5.0), 0.8);
    color = mix(color, uContour, majorLine * uContourOpacity);
    color = mix(color, uContourMinor, minorLine * uContourOpacity * 0.45);

    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 0.92));

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const riskVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const riskFragment = `
  uniform sampler2D uRisk;
  uniform vec3 uRiskLow;
  uniform vec3 uRiskHigh;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float risk = texture2D(uRisk, vUv).r;
    float alpha = smoothstep(0.46, 0.9, risk) * uOpacity;
    if (alpha < 0.008) discard;
    vec3 color = mix(uRiskLow, uRiskHigh, smoothstep(0.42, 1.0, risk));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

interface TerrainProps {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
  riskVisible: boolean;
}

export function Terrain({ world, heights, preset, riskVisible }: TerrainProps) {
  const geometry = useMemo(() => {
    const data = buildTerrainGeometry(world, heights);
    const value = new THREE.BufferGeometry();
    value.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    value.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    value.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    value.setIndex(new THREE.BufferAttribute(data.indices, 1));
    value.computeBoundingSphere();
    return value;
  }, [world, heights]);

  const overlayGeometry = useMemo(() => {
    const value = geometry.clone();
    const positions = value.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, positions.getY(index) + 0.035);
    }
    positions.needsUpdate = true;
    return value;
  }, [geometry]);

  const riskTexture = useMemo(() => {
    const texture = new THREE.DataTexture(
      riskTextureData(world),
      world.risk_grid.width,
      world.risk_grid.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }, [world]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      overlayGeometry.dispose();
      riskTexture.dispose();
    };
  }, [geometry, overlayGeometry, riskTexture]);

  const palette = preset.palette;
  const uniforms = useMemo(
    () => ({
      uLow: { value: new THREE.Color(palette.low) },
      uMid: { value: new THREE.Color(palette.mid) },
      uHigh: { value: new THREE.Color(palette.high) },
      uContour: { value: new THREE.Color(palette.contour) },
      uContourMinor: { value: new THREE.Color(palette.contourMinor) },
      uAccent: { value: new THREE.Color(palette.accent) },
      uFogColor: { value: new THREE.Color(palette.fog) },
      uFogDensity: { value: palette.fogDensity },
      uMinElev: { value: world.terrain.min_elevation_m * HEIGHT_TO_SCENE },
      uMaxElev: { value: world.terrain.max_elevation_m * HEIGHT_TO_SCENE },
      uContourInterval: { value: preset.contourInterval * HEIGHT_TO_SCENE },
      uContourOpacity: { value: preset.contourOpacity },
    }),
    [palette, preset.contourInterval, preset.contourOpacity, world],
  );

  const riskUniforms = useMemo(
    () => ({
      uRisk: { value: riskTexture },
      uRiskLow: { value: new THREE.Color(palette.riskLow) },
      uRiskHigh: { value: new THREE.Color(palette.riskHigh) },
      uOpacity: { value: preset.riskOpacity },
    }),
    [palette, preset.riskOpacity, riskTexture],
  );

  return (
    <group>
      <mesh geometry={geometry}>
        {preset.wireframe ? (
          <meshBasicMaterial
            color={palette.contour}
            wireframe
            transparent
            opacity={0.62}
            fog
          />
        ) : (
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={terrainVertex}
            fragmentShader={terrainFragment}
          />
        )}
      </mesh>
      {riskVisible && !preset.wireframe ? (
        <mesh geometry={overlayGeometry} renderOrder={2}>
          <shaderMaterial
            uniforms={riskUniforms}
            vertexShader={riskVertex}
            fragmentShader={riskFragment}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      ) : null}
    </group>
  );
}

interface BaseSlabProps {
  world: World;
  preset: ViewPreset;
}

export function BaseSlab({ world, preset }: BaseSlabProps) {
  const size = sceneSize(world);
  return (
    <mesh position={[0, -1.9, 0]} receiveShadow={false}>
      <boxGeometry args={[size, 3.8, size]} />
      <meshStandardMaterial
        color={preset.palette.low}
        roughness={0.9}
        metalness={0.18}
      />
      <Edges scale={1} threshold={15} color={preset.palette.contourMinor} />
    </mesh>
  );
}

interface WaterProps {
  world: World;
  heights: Int16Array;
  snapshot: Snapshot | null;
  preset: ViewPreset;
}

export function Water({ world, heights, snapshot, preset }: WaterProps) {
  if (world.hazard.kind !== 'flood') return null;
  const level = snapshot?.hazard.water_level_m ?? world.hazard.base_level_m;
  const y = level * HEIGHT_TO_SCENE + 0.12;
  const size = sceneSize(world);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} renderOrder={1}>
        <planeGeometry args={[size, size, 1, 1]} />
        <meshPhysicalMaterial
          color={preset.palette.water}
          roughness={0.2}
          metalness={0.05}
          transparent
          opacity={0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, y - 0.01, 0]} renderOrder={1}>
        <planeGeometry args={[size, size, 1, 1]} />
        <meshBasicMaterial
          color={preset.palette.waterHighlight}
          transparent
          opacity={0.035}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <RiverLine world={world} heights={heights} preset={preset} />
    </group>
  );
}

export function RiverLine({
  world,
  heights,
  preset,
}: {
  world: World;
  heights: Int16Array;
  preset: ViewPreset;
}) {
  const points = useMemo(
    () =>
      world.river.polyline.map((point) => scenePoint(world, heights, point, 0.18)),
    [world, heights],
  );
  if (points.length < 2) return null;
  return (
    <group>
      <Line
        points={points}
        color={preset.palette.water}
        lineWidth={9}
        transparent
        opacity={0.28}
        depthWrite={false}
      />
      <Line
        points={points}
        color={preset.palette.waterHighlight}
        lineWidth={3}
        transparent
        opacity={0.72}
      />
    </group>
  );
}

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

interface WeatherProps {
  world: World;
  scenario: ScenarioConfig;
  preset: ViewPreset;
  snapshot: Snapshot | null;
  visible: boolean;
}

export function Weather({ world, scenario, preset, snapshot, visible }: WeatherProps) {
  const rainfall = scenario.weather.rainfall_mm_h;
  const fire =
    world.hazard.kind === 'wildfire'
      ? snapshot?.hazard.fire_radius_km ?? world.hazard.fire_radius_peak_km
      : 0;
  if (!visible || !preset.showWeather) return null;
  if (rainfall > 1) {
    return <RainField world={world} intensity={rainfall} preset={preset} />;
  }
  if (fire > 0) {
    return <AshField world={world} preset={preset} />;
  }
  return null;
}

function RainField({
  world,
  intensity,
  preset,
}: {
  world: World;
  intensity: number;
  preset: ViewPreset;
}) {
  const count = Math.round(180 + Math.min(1, intensity / 80) * 620);
  const points = useRef<THREE.Points>(null);
  const span = sceneSize(world);
  const positions = useMemo(() => {
    const random = seededRandom(world.seed + 17);
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      values[index * 3] = (random() - 0.5) * span * 1.2;
      values[index * 3 + 1] = random() * Math.max(28, span * 0.35);
      values[index * 3 + 2] = (random() - 0.5) * span * 1.2;
    }
    return values;
  }, [count, span, world.seed]);

  useFrame((_, delta) => {
    const attribute = points.current?.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    const speed = 9 + intensity * 0.18;
    const ceiling = Math.max(28, span * 0.35);
    for (let index = 1; index < attribute.array.length; index += 3) {
      const next = (attribute.array[index] as number) - delta * speed;
      attribute.array[index] = next < 0 ? next + ceiling : next;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={preset.palette.waterHighlight}
        size={0.055}
        transparent
        opacity={0.32}
        sizeAttenuation
        depthWrite={false}
        fog
      />
    </points>
  );
}

function AshField({ world, preset }: { world: World; preset: ViewPreset }) {
  const points = useRef<THREE.Points>(null);
  const count = 260;
  const span = sceneSize(world);
  const half = span * 0.47;
  const positions = useMemo(() => {
    const random = seededRandom(world.seed + 31);
    const values = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      values[index * 3] = (random() - 0.5) * span * 0.925;
      values[index * 3 + 1] = random() * 22 + 1;
      values[index * 3 + 2] = (random() - 0.5) * span * 0.925;
    }
    return values;
  }, [span, world.seed]);

  useFrame((state, delta) => {
    const attribute = points.current?.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute | undefined;
    if (!attribute) return;
    for (let index = 0; index < attribute.array.length; index += 3) {
      const x = (attribute.array[index] as number) + delta * (0.2 + Math.sin(state.clock.elapsedTime * 0.2 + index) * 0.12);
      const y = (attribute.array[index + 1] as number) - delta * 0.35;
      attribute.array[index] = x > half ? -half : x;
      attribute.array[index + 1] = y < 0.3 ? 22 : y;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={preset.palette.demand}
        size={0.055}
        transparent
        opacity={0.32}
        sizeAttenuation
        depthWrite={false}
        fog
      />
    </points>
  );
}

export function FirePerimeter({
  world,
  heights,
  snapshot,
  preset,
}: {
  world: World;
  heights: Int16Array;
  snapshot: Snapshot | null;
  preset: ViewPreset;
}) {
  if (world.hazard.kind !== 'wildfire') return null;
  const radiusKm = snapshot?.hazard.fire_radius_km ?? world.hazard.fire_radius_peak_km;
  const radius = Math.max(160, radiusKm * 1000);
  const outer = circlePoints(world, heights, world.hazard.fire_center, radius, 96, 0.55);
  const inner = circlePoints(
    world,
    heights,
    world.hazard.fire_center,
    radius * 0.62,
    80,
    0.65,
  );
  const center = scenePoint(world, heights, world.hazard.fire_center, 0.9);
  return (
    <group>
      <Line
        points={outer}
        color={preset.palette.rejected}
        lineWidth={2.4}
        transparent
        opacity={0.9}
      />
      <Line
        points={inner}
        color={preset.palette.degraded}
        lineWidth={1.2}
        transparent
        opacity={0.7}
        dashed
        dashSize={1.2}
        gapSize={0.7}
      />
      <mesh position={center}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color={preset.palette.rejected} />
      </mesh>
    </group>
  );
}
