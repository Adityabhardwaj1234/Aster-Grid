import type { RoadEdge, ScenarioConfig, Vec2, World } from '../types';

export const METER_TO_SCENE = 0.01;
export const HEIGHT_TO_SCENE = 0.03;
export const SCENE_SIZE = 80;

export function sceneSize(world: World): number {
  return world.map_size_m * METER_TO_SCENE;
}

export function sceneScale(world: World): number {
  return sceneSize(world) / SCENE_SIZE;
}

export function decodeHeightmap(world: World): Int16Array {
  const raw = atob(world.terrain.heightmap_b64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

export function worldSize(world: World): number {
  return world.map_size_m;
}

export function sceneX(world: World, x: number): number {
  return (x - world.map_size_m / 2) * METER_TO_SCENE;
}

export function sceneZ(world: World, z: number): number {
  return (z - world.map_size_m / 2) * METER_TO_SCENE;
}

export function heightAt(world: World, heights: Int16Array, x: number, z: number): number {
  const { width, height, heightmap_scale } = world.terrain;
  const fx = clamp((x / world.map_size_m) * (width - 1), 0, width - 1);
  const fz = clamp((z / world.map_size_m) * (height - 1), 0, height - 1);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const x1 = Math.min(width - 1, x0 + 1);
  const z1 = Math.min(height - 1, z0 + 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const a = heights[z0 * width + x0] * heightmap_scale;
  const b = heights[z0 * width + x1] * heightmap_scale;
  const c = heights[z1 * width + x0] * heightmap_scale;
  const d = heights[z1 * width + x1] * heightmap_scale;
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function sceneY(
  world: World,
  heights: Int16Array,
  x: number,
  z: number,
  lift = 0,
): number {
  return heightAt(world, heights, x, z) * HEIGHT_TO_SCENE + lift;
}

export function scenePoint(
  world: World,
  heights: Int16Array,
  point: Vec2,
  lift = 0,
): [number, number, number] {
  return [
    sceneX(world, point[0]),
    sceneY(world, heights, point[0], point[1], lift),
    sceneZ(world, point[1]),
  ];
}

export function terrainPositions(world: World, heights: Int16Array): Float32Array {
  const { width, height } = world.terrain;
  const size = sceneSize(world);
  const positions = new Float32Array(width * height * 3);
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const index = iz * width + ix;
      positions[index * 3] = (ix / (width - 1) - 0.5) * size;
      positions[index * 3 + 1] =
        heights[index] * world.terrain.heightmap_scale * HEIGHT_TO_SCENE;
      positions[index * 3 + 2] = (iz / (height - 1) - 0.5) * size;
    }
  }
  return positions;
}

export function terrainUvs(world: World): Float32Array {
  const { width, height } = world.terrain;
  const uvs = new Float32Array(width * height * 2);
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const index = iz * width + ix;
      uvs[index * 2] = ix / (width - 1);
      uvs[index * 2 + 1] = iz / (height - 1);
    }
  }
  return uvs;
}

export function terrainIndices(world: World): Uint32Array {
  const { width, height } = world.terrain;
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  let cursor = 0;
  for (let iz = 0; iz < height - 1; iz += 1) {
    for (let ix = 0; ix < width - 1; ix += 1) {
      const a = iz * width + ix;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      indices[cursor] = a;
      indices[cursor + 1] = c;
      indices[cursor + 2] = b;
      indices[cursor + 3] = b;
      indices[cursor + 4] = c;
      indices[cursor + 5] = d;
      cursor += 6;
    }
  }
  return indices;
}

export function buildTerrainGeometry(world: World, heights: Int16Array) {
  const positions = terrainPositions(world, heights);
  const uvs = terrainUvs(world);
  const indices = terrainIndices(world);
  const normals = new Float32Array(positions.length);
  const { width, height } = world.terrain;
  const v0 = [0, 0, 0];
  const v1 = [0, 0, 0];
  const v2 = [0, 0, 0];
  const n = [0, 0, 0];
  for (let iz = 0; iz < height; iz += 1) {
    for (let ix = 0; ix < width; ix += 1) {
      const index = iz * width + ix;
      const left = iz * width + Math.max(0, ix - 1);
      const right = iz * width + Math.min(width - 1, ix + 1);
      const up = Math.max(0, iz - 1) * width + ix;
      const down = Math.min(height - 1, iz + 1) * width + ix;
      v0[0] = positions[right * 3] - positions[left * 3];
      v0[1] = positions[right * 3 + 1] - positions[left * 3 + 1];
      v0[2] = positions[right * 3 + 2] - positions[left * 3 + 2];
      v1[0] = positions[down * 3] - positions[up * 3];
      v1[1] = positions[down * 3 + 1] - positions[up * 3 + 1];
      v1[2] = positions[down * 3 + 2] - positions[up * 3 + 2];
      n[0] = v0[1] * v1[2] - v0[2] * v1[1];
      n[1] = v0[2] * v1[0] - v0[0] * v1[2];
      n[2] = v0[0] * v1[1] - v0[1] * v1[0];
      const length = Math.hypot(n[0], n[1], n[2]) || 1;
      normals[index * 3] = n[0] / length;
      normals[index * 3 + 1] = Math.abs(n[1] / length);
      normals[index * 3 + 2] = n[2] / length;
    }
  }
  void v2;
  return { positions, uvs, indices, normals };
}

export function edgeById(world: World): Map<string, RoadEdge> {
  return new Map(world.edges.map((edge) => [edge.id, edge]));
}

export function routePoints(
  world: World,
  heights: Int16Array,
  edgeIds: string[],
  originNodeId?: string,
  lift = 0.42,
): Array<[number, number, number]> {
  const edges = edgeById(world);
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  let current = originNodeId ?? null;
  const points: Array<[number, number, number]> = [];
  for (const edgeId of edgeIds) {
    const edge = edges.get(edgeId);
    if (!edge) continue;
    let polyline = edge.polyline;
    if (current === edge.b && edge.a !== current) {
      polyline = [...polyline].reverse();
    } else if (current && current !== edge.a && current !== edge.b) {
      const first = polyline[0];
      const last = polyline[polyline.length - 1];
      const currentPoint = nodes.get(current);
      if (currentPoint) {
        const firstDistance = Math.hypot(first[0] - currentPoint.x, first[1] - currentPoint.z);
        const lastDistance = Math.hypot(last[0] - currentPoint.x, last[1] - currentPoint.z);
        if (lastDistance < firstDistance) polyline = [...polyline].reverse();
      }
    }
    const mapped = polyline.map((point) => scenePoint(world, heights, point, lift));
    if (points.length && mapped.length) {
      const last = points[points.length - 1];
      const first = mapped[0];
      if (Math.hypot(last[0] - first[0], last[2] - first[2]) < 0.15) {
        points.push(...mapped.slice(1));
      } else {
        points.push(...mapped);
      }
    } else {
      points.push(...mapped);
    }
    current = current === edge.a ? edge.b : edge.a;
  }
  return points;
}

export function edgePoints(
  world: World,
  heights: Int16Array,
  edge: RoadEdge,
  lift = 0.35,
): Array<[number, number, number]> {
  return edge.polyline.map((point) => scenePoint(world, heights, point, lift));
}

export function circlePoints(
  world: World,
  heights: Int16Array,
  center: [number, number],
  radiusMeters: number,
  segments = 96,
  lift = 0.55,
): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = center[0] + Math.cos(angle) * radiusMeters;
    const z = center[1] + Math.sin(angle) * radiusMeters;
    points.push(scenePoint(world, heights, [x, z], lift));
  }
  return points;
}

export function districtCenter(
  world: World,
  heights: Int16Array,
  centroid: Vec2,
  lift = 1.2,
): [number, number, number] {
  return scenePoint(world, heights, centroid, lift);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scenarioStateLabel(world: World | null, scenario: ScenarioConfig | null): string {
  if (!world) return 'No world loaded';
  if (scenario && world.seed !== scenario.seed) return 'Stale draft';
  return world.hash ? 'Draft world' : 'World';
}

export function riskTextureData(world: World): Uint8Array {
  const data = new Uint8Array(world.risk_grid.width * world.risk_grid.height * 4);
  for (let index = 0; index < world.risk_grid.values.length; index += 1) {
    const value = clamp(world.risk_grid.values[index], 0, 1);
    data[index * 4] = Math.round(value * 255);
    data[index * 4 + 1] = Math.round(value * 255);
    data[index * 4 + 2] = Math.round(value * 255);
    data[index * 4 + 3] = 255;
  }
  return data;
}
