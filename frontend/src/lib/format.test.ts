import { describe, expect, it } from 'vitest';

import {
  formatClock,
  formatDuration,
  formatMinutes,
  formatNumber,
  formatPct,
  formatTimestamp,
  shortHash,
  statusLabel,
  titleCase,
} from './format';

describe('format helpers', () => {
  it('formats nullish values without inventing data', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatMinutes(null)).toBe('—');
    expect(formatTimestamp(null)).toBe('—');
    expect(shortHash('')).toBe('—');
  });

  it('formats durations and percentages', () => {
    expect(formatPct(98.74, 1)).toBe('98.7%');
    expect(formatMinutes(360)).toBe('6h 00m');
    expect(formatMinutes(7)).toBe('7m');
    expect(formatDuration(845)).toBe('845 ms');
    expect(formatDuration(2825)).toBe('2.83 s');
  });

  it('wraps the simulation clock at midnight', () => {
    expect(formatClock(6, 0)).toBe('06:00');
    expect(formatClock(6, 360)).toBe('12:00');
    expect(formatClock(23, 90)).toBe('00:30');
  });

  it('normalises labels and hashes', () => {
    expect(titleCase('time_window_overlap')).toBe('Time Window Overlap');
    expect(statusLabel('needs_attention')).toBe('Needs attention');
    expect(statusLabel('completed')).toBe('Completed');
    expect(shortHash('abcdef1234567890', 6)).toBe('abcdef');
  });

  it('formats timestamps in a stable 24-hour clock', () => {
    const result = formatTimestamp('2026-10-25T14:19:18.000Z');
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
