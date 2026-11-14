import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIEW_PRESET,
  QUALITY_DPR,
  VIEW_PRESETS,
  viewPresetById,
  type ViewPresetId,
} from './viewPresets';

const REQUIRED_IDS: ViewPresetId[] = [
  'topographic',
  'radar',
  'nightops',
  'thermal',
  'hydrology',
  'coverage',
  'wireframe',
  'cinematic',
  'minimal',
];

describe('view presets', () => {
  it('ships exactly the nine required presets', () => {
    expect(VIEW_PRESETS).toHaveLength(9);
    expect(VIEW_PRESETS.map((preset) => preset.id)).toEqual(REQUIRED_IDS);
    expect(new Set(VIEW_PRESETS.map((preset) => preset.name)).size).toBe(9);
    expect(DEFAULT_VIEW_PRESET).toBe('topographic');
  });

  it('keeps every camera finite and every palette complete', () => {
    for (const preset of VIEW_PRESETS) {
      expect(preset.camera.position).toHaveLength(3);
      expect(preset.camera.target).toHaveLength(3);
      for (const value of [...preset.camera.position, ...preset.camera.target]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(preset.camera.fov).toBeGreaterThan(20);
      expect(preset.camera.fov).toBeLessThan(80);
      expect(preset.palette.background).toMatch(/^#/);
      expect(preset.palette.accent).toMatch(/^#/);
      expect(preset.contourOpacity).toBeGreaterThanOrEqual(0);
      expect(preset.contourOpacity).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to the topographic preset for unknown values', () => {
    expect(viewPresetById('radar').id).toBe('radar');
    expect(viewPresetById('unknown' as ViewPresetId).id).toBe(DEFAULT_VIEW_PRESET);
  });

  it('describes bounded device pixel ratios', () => {
    const maxDpr = (value: number | [number, number]) => (Array.isArray(value) ? value[1] : value);
    expect(maxDpr(QUALITY_DPR.low)).toBeLessThan(maxDpr(QUALITY_DPR.high));
    expect(maxDpr(QUALITY_DPR.balanced)).toBeLessThanOrEqual(1.5);
  });
});
