export type ViewPresetId =
  | 'topographic'
  | 'radar'
  | 'nightops'
  | 'thermal'
  | 'hydrology'
  | 'coverage'
  | 'wireframe'
  | 'cinematic'
  | 'minimal';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface ScenePalette {
  background: string;
  fog: string;
  fogDensity: number;
  low: string;
  mid: string;
  high: string;
  contour: string;
  contourMinor: string;
  water: string;
  waterHighlight: string;
  road: string;
  roadMuted: string;
  bridge: string;
  closed: string;
  degraded: string;
  proposed: string;
  validated: string;
  rejected: string;
  demand: string;
  demandMet: string;
  assetRescue: string;
  assetMedical: string;
  assetSupply: string;
  assetDrone: string;
  facility: string;
  accent: string;
  riskLow: string;
  riskHigh: string;
  ambient: number;
  key: number;
  rim: number;
  night: boolean;
}

export interface ViewPreset {
  id: ViewPresetId;
  name: string;
  subtitle: string;
  camera: CameraPose;
  palette: ScenePalette;
  contourInterval: number;
  contourOpacity: number;
  riskOpacity: number;
  wireframe: boolean;
  autoRotate: boolean;
  showWeather: boolean;
  saturation: number;
}

const base: ScenePalette = {
  background: '#050912',
  fog: '#07111f',
  fogDensity: 0.0052,
  low: '#0c2638',
  mid: '#16415a',
  high: '#77d9d2',
  contour: '#9aecff',
  contourMinor: '#2d6f86',
  water: '#0a3d63',
  waterHighlight: '#4fd8ff',
  road: '#8aa6b5',
  roadMuted: '#2f4858',
  bridge: '#ffc46b',
  closed: '#ff5a5f',
  degraded: '#ffb35c',
  proposed: '#ffb35c',
  validated: '#5ff4ff',
  rejected: '#ff5a6e',
  demand: '#ffd166',
  demandMet: '#5ef2b2',
  assetRescue: '#6ad9ff',
  assetMedical: '#ff8aa5',
  assetSupply: '#ffd166',
  assetDrone: '#a8b8ff',
  facility: '#d8f5ff',
  accent: '#4fd8ff',
  riskLow: '#276b7b',
  riskHigh: '#ff5a5f',
  ambient: 0.55,
  key: 1.15,
  rim: 0.55,
  night: true,
};

export const VIEW_PRESETS: ViewPreset[] = [
  {
    id: 'topographic',
    name: 'Topographic',
    subtitle: 'Balanced contour survey',
    camera: { position: [58, 52, 72], target: [0, 1.8, 0], fov: 42 },
    palette: base,
    contourInterval: 12,
    contourOpacity: 0.78,
    riskOpacity: 0.32,
    wireframe: false,
    autoRotate: false,
    showWeather: true,
    saturation: 1,
  },
  {
    id: 'radar',
    name: 'Radar Sweep',
    subtitle: 'Plan view · signal density',
    camera: { position: [0, 140, 0.02], target: [0, 0, 0], fov: 36 },
    palette: {
      ...base,
      background: '#03090b',
      fog: '#041014',
      fogDensity: 0.003,
      low: '#06191b',
      mid: '#0c3838',
      high: '#74ffe4',
      contour: '#93ffe9',
      contourMinor: '#1e6963',
      road: '#7ae8d5',
      bridge: '#ffe493',
      ambient: 0.4,
      key: 0.85,
      rim: 0.85,
      accent: '#7dffe7',
      riskLow: '#1d6b62',
      riskHigh: '#ff9f43',
    },
    contourInterval: 9,
    contourOpacity: 0.95,
    riskOpacity: 0.24,
    wireframe: false,
    autoRotate: false,
    showWeather: false,
    saturation: 1.15,
  },
  {
    id: 'nightops',
    name: 'Night Ops',
    subtitle: 'Low-light field response',
    camera: { position: [-62, 44, 80], target: [0, 1.4, 0], fov: 44 },
    palette: {
      ...base,
      background: '#02040a',
      fog: '#050b17',
      fogDensity: 0.009,
      low: '#091827',
      mid: '#1a3b50',
      high: '#5d8ba8',
      contour: '#59a4c2',
      contourMinor: '#1d485e',
      water: '#051b2c',
      waterHighlight: '#3b9ac4',
      road: '#6f91a6',
      bridge: '#ffb44d',
      ambient: 0.42,
      key: 0.95,
      rim: 0.6,
      accent: '#ffc46b',
      riskLow: '#174453',
      riskHigh: '#ff6a4d',
    },
    contourInterval: 14,
    contourOpacity: 0.6,
    riskOpacity: 0.42,
    wireframe: false,
    autoRotate: false,
    showWeather: true,
    saturation: 0.9,
  },
  {
    id: 'thermal',
    name: 'Thermal',
    subtitle: 'Hazard-first heat map',
    camera: { position: [76, 42, -58], target: [0, 1.2, 0], fov: 42 },
    palette: {
      ...base,
      background: '#0a0507',
      fog: '#150a08',
      fogDensity: 0.0058,
      low: '#180d12',
      mid: '#4a1a1d',
      high: '#ffbd6a',
      contour: '#ffd694',
      contourMinor: '#8f3b2e',
      water: '#1b1724',
      waterHighlight: '#ff8f5e',
      road: '#b78872',
      bridge: '#ffd27d',
      closed: '#ff3a4e',
      ambient: 0.36,
      key: 1.05,
      rim: 0.7,
      accent: '#ff9b4a',
      riskLow: '#5e2b22',
      riskHigh: '#ff3a3a',
    },
    contourInterval: 10,
    contourOpacity: 0.72,
    riskOpacity: 0.55,
    wireframe: false,
    autoRotate: false,
    showWeather: true,
    saturation: 1.2,
  },
  {
    id: 'hydrology',
    name: 'Hydrology',
    subtitle: 'River stage · closure risk',
    camera: { position: [78, 46, 68], target: [0, 0.2, 0], fov: 41 },
    palette: {
      ...base,
      background: '#020b15',
      fog: '#031526',
      fogDensity: 0.0048,
      low: '#071a2a',
      mid: '#0f3f60',
      high: '#a8ecff',
      contour: '#b5f1ff',
      contourMinor: '#1e6584',
      water: '#075c91',
      waterHighlight: '#86e9ff',
      road: '#93bdd3',
      bridge: '#ffd37e',
      ambient: 0.5,
      key: 1.1,
      rim: 0.75,
      accent: '#4fd8ff',
      riskLow: '#10495e',
      riskHigh: '#ff6a5a',
    },
    contourInterval: 8,
    contourOpacity: 0.82,
    riskOpacity: 0.38,
    wireframe: false,
    autoRotate: false,
    showWeather: true,
    saturation: 1.05,
  },
  {
    id: 'coverage',
    name: 'Coverage',
    subtitle: 'Task completion · unmet demand',
    camera: { position: [18, 112, 4], target: [0, 0.4, 0], fov: 38 },
    palette: {
      ...base,
      background: '#04080c',
      fog: '#07111a',
      fogDensity: 0.0038,
      low: '#09151b',
      mid: '#16313a',
      high: '#39545e',
      contour: '#385b65',
      contourMinor: '#142b33',
      road: '#3f5861',
      roadMuted: '#20323a',
      bridge: '#a88d58',
      demand: '#ffd166',
      demandMet: '#5ef2b2',
      ambient: 0.42,
      key: 0.72,
      rim: 0.34,
      accent: '#5ef2b2',
      riskLow: '#1f5d4e',
      riskHigh: '#ff9f43',
    },
    contourInterval: 18,
    contourOpacity: 0.35,
    riskOpacity: 0.12,
    wireframe: false,
    autoRotate: false,
    showWeather: false,
    saturation: 1,
  },
  {
    id: 'wireframe',
    name: 'Wireframe',
    subtitle: 'Network skeleton',
    camera: { position: [66, 48, 66], target: [0, 1.6, 0], fov: 44 },
    palette: {
      ...base,
      background: '#030711',
      fog: '#050b16',
      fogDensity: 0.0028,
      low: '#0f2039',
      mid: '#19416a',
      high: '#7ad9ff',
      contour: '#6bc6f2',
      contourMinor: '#1a4061',
      road: '#83d7f7',
      bridge: '#ffce78',
      ambient: 0.38,
      key: 0.5,
      rim: 0.8,
      accent: '#8fe8ff',
      riskLow: '#235e80',
      riskHigh: '#ff6a5a',
    },
    contourInterval: 16,
    contourOpacity: 0.32,
    riskOpacity: 0.2,
    wireframe: true,
    autoRotate: true,
    showWeather: false,
    saturation: 1.1,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    subtitle: 'Low camera · atmospheric depth',
    camera: { position: [38, 15, 62], target: [0, 3.2, 0], fov: 56 },
    palette: {
      ...base,
      background: '#03050b',
      fog: '#06101f',
      fogDensity: 0.012,
      low: '#071728',
      mid: '#12344c',
      high: '#86dfe0',
      contour: '#b6f5ff',
      contourMinor: '#255b72',
      water: '#0a3a5e',
      waterHighlight: '#63e6ff',
      road: '#9db9c8',
      bridge: '#ffc46b',
      ambient: 0.42,
      key: 1.25,
      rim: 0.95,
      accent: '#ffc46b',
      riskLow: '#225a66',
      riskHigh: '#ff765d',
    },
    contourInterval: 11,
    contourOpacity: 0.7,
    riskOpacity: 0.36,
    wireframe: false,
    autoRotate: false,
    showWeather: true,
    saturation: 1.05,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    subtitle: 'High-contrast survey plate',
    camera: { position: [58, 56, 62], target: [0, 1, 0], fov: 38 },
    palette: {
      ...base,
      background: '#dfe9e7',
      fog: '#d5e2e0',
      fogDensity: 0.0015,
      low: '#a9bfbb',
      mid: '#789a96',
      high: '#2f5353',
      contour: '#f7fffd',
      contourMinor: '#8fa8a3',
      water: '#6d9aa5',
      waterHighlight: '#d7fbff',
      road: '#405d5d',
      roadMuted: '#94a9a6',
      bridge: '#9a6b2f',
      closed: '#b63f45',
      proposed: '#a56a24',
      validated: '#0b7a76',
      rejected: '#b63f45',
      demand: '#8c6a1f',
      demandMet: '#0b7a76',
      assetRescue: '#1a687e',
      assetMedical: '#a34d61',
      assetSupply: '#8c6a1f',
      assetDrone: '#5a5f9b',
      facility: '#1c3434',
      accent: '#0b7a76',
      riskLow: '#c4d6d1',
      riskHigh: '#b64545',
      ambient: 1.1,
      key: 2.1,
      rim: 0.2,
      night: false,
    },
    contourInterval: 20,
    contourOpacity: 0.45,
    riskOpacity: 0.18,
    wireframe: false,
    autoRotate: false,
    showWeather: false,
    saturation: 0.85,
  },
];

export const DEFAULT_VIEW_PRESET: ViewPresetId = 'topographic';

export function viewPresetById(id: ViewPresetId): ViewPreset {
  return VIEW_PRESETS.find((preset) => preset.id === id) ?? VIEW_PRESETS[0];
}

export type QualityLevel = 'low' | 'balanced' | 'high';

export const QUALITY_DPR: Record<QualityLevel, number | [number, number]> = {
  low: 1,
  balanced: [1, 1.5],
  high: [1, 2],
};
