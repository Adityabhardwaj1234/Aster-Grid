import { describe, expect, it } from 'vitest';

import type { World } from '../types';
import {
  buildTerrainGeometry,
  decodeHeightmap,
  heightAt,
  scenePoint,
  sceneScale,
  sceneSize,
  sceneX,
  sceneZ,
  terrainPositions,
} from './sceneMath';

function heightmapBase64(values: number[]): string {
  const bytes = new Uint8Array(values.length * 2);
  values.forEach((value, index) => {
    const view = new DataView(bytes.buffer);
    view.setInt16(index * 2, value, true);
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function makeWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'world-test',
    title: 'Test Basin',
    seed: 1847,
    map_size_m: 8000,
    hash: 'abc123',
    terrain: {
      width: 3,
      height: 3,
      heightmap_b64: heightmapBase64([0, 10, 20, 30, 40, 50, 60, 70, 80]),
      heightmap_scale: 0.5,
      min_elevation_m: 0,
      max_elevation_m: 40,
      contour_interval_m: 5,
    },
    districts: [],
    nodes: [],
    edges: [],
    facilities: [],
    assets: [],
    demands: [],
    river: { polyline: [], width_m: 40 },
    hazard: {
      kind: 'flood',
      base_level_m: 0,
      peak_level_m: 2,
      fire_center: [0, 0],
      fire_radius_peak_km: 0,
    },
    risk_grid: { width: 2, height: 2, values: [0, 0.25, 0.5, 1] },
    ...overrides,
  } as World;
}

describe('scene math', () => {
  it('decodes little-endian heightmap payloads', () => {
    const world = makeWorld();
    const decoded = decodeHeightmap(world);
    expect(Array.from(decoded)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it('derives scene size from the world map size', () => {
    const world = makeWorld();
    expect(sceneSize(world)).toBe(80);
    expect(sceneScale(world)).toBe(1);
    expect(sceneX(world, 0)).toBe(-40);
    expect(sceneX(world, 8000)).toBe(40);
    expect(sceneZ(world, 4000)).toBe(0);
    expect(sceneSize(makeWorld({ map_size_m: 16000 }))).toBe(160);
    expect(sceneScale(makeWorld({ map_size_m: 16000 }))).toBe(2);
  });

  it('bilinearly samples elevation and applies vertical lift', () => {
    const world = makeWorld();
    const heights = decodeHeightmap(world);
    expect(heightAt(world, heights, 0, 0)).toBeCloseTo(0);
    expect(heightAt(world, heights, 4000, 4000)).toBeCloseTo(20);
    expect(heightAt(world, heights, 8000, 8000)).toBeCloseTo(40);
    const [x, y, z] = scenePoint(world, heights, [4000, 4000], 0.5);
    expect(x).toBe(0);
    expect(z).toBe(0);
    expect(y).toBeCloseTo(20 * 0.03 + 0.5);
  });

  it('builds a terrain mesh covering the derived size', () => {
    const world = makeWorld();
    const heights = decodeHeightmap(world);
    const positions = terrainPositions(world, heights);
    expect(positions).toHaveLength(3 * 3 * 3);
    expect(Math.min(...positions.filter((_, index) => index % 3 === 0))).toBeCloseTo(-40);
    expect(Math.max(...positions.filter((_, index) => index % 3 === 0))).toBeCloseTo(40);
    const geometry = buildTerrainGeometry(world, heights);
    expect(geometry.indices).toHaveLength((3 - 1) * (3 - 1) * 6);
    expect(geometry.normals).toHaveLength(positions.length);
  });
});
