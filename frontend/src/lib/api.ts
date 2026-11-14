import type {
  AgentDescriptor,
  ApiErrorPayload,
  HealthResponse,
  MetaResponse,
  PresetInfo,
  PreviewResponse,
  RunBundle,
  RunCreated,
  RunEvent,
  RunRecord,
  ScenarioConfig,
} from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code || 'REQUEST_FAILED';
    this.details = payload.details ?? [];
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let payload: ApiErrorPayload = {
      code: 'REQUEST_FAILED',
      message: `Request failed with status ${response.status}.`,
      details: [],
    };
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Keep the status-derived message when the server did not return JSON.
    }
    throw new ApiError(response.status, payload);
  }
  return (await response.json()) as T;
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request('/api/health', { signal });
}

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return request('/api/meta', { signal });
}

export function getPresets(signal?: AbortSignal): Promise<PresetInfo[]> {
  return request('/api/presets', { signal });
}

export function getAgents(signal?: AbortSignal): Promise<AgentDescriptor[]> {
  return request('/api/agents', { signal });
}

export function previewWorld(
  scenario: ScenarioConfig,
  signal?: AbortSignal,
): Promise<PreviewResponse> {
  return request('/api/preview', {
    method: 'POST',
    body: JSON.stringify(scenario),
    signal,
  });
}

export function createRun(
  scenario: ScenarioConfig,
  previewHash: string | null,
): Promise<RunCreated> {
  const query = previewHash ? `?preview_world_hash=${encodeURIComponent(previewHash)}` : '';
  return request(`/api/runs${query}`, {
    method: 'POST',
    body: JSON.stringify(scenario),
  });
}

export function getRuns(limit = 20, signal?: AbortSignal): Promise<RunRecord[]> {
  return request(`/api/runs?limit=${limit}`, { signal });
}

export function getRun(runId: string, signal?: AbortSignal): Promise<RunRecord> {
  return request(`/api/runs/${encodeURIComponent(runId)}`, { signal });
}

export function getRunBundle(runId: string, signal?: AbortSignal): Promise<RunBundle> {
  return request(`/api/runs/${encodeURIComponent(runId)}/bundle`, { signal });
}

export function getRunEvents(runId: string, after = 0, signal?: AbortSignal): Promise<RunEvent[]> {
  return request(
    `/api/runs/${encodeURIComponent(runId)}/events?after=${after}&limit=5000`,
    { signal },
  );
}

export function cancelRun(runId: string): Promise<RunRecord> {
  return request(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
}

export async function getReportMarkdown(runId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/report.md`, {
    headers: { Accept: 'text/plain' },
  });
  if (!response.ok) {
    let payload: ApiErrorPayload = {
      code: 'REPORT_UNAVAILABLE',
      message: 'The report is not available yet.',
      details: [],
    };
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Fall through with the default message.
    }
    throw new ApiError(response.status, payload);
  }
  return response.text();
}

export function streamUrl(runId: string, after: number): string {
  return `${API_BASE}/api/runs/${encodeURIComponent(runId)}/stream?after=${after}`;
}
