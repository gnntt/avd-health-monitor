import { describe, it, expect } from 'vitest';
import {
  getLatencyStatus,
  formatLatency,
  getStatusColor,
  getStatusBgColor,
  trimHistory,
  historyInRange,
  downsampleHistory,
  HISTORY_RETENTION_MS,
  MAX_HISTORY_SAMPLES,
} from './utils';

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
// `count` samples, `stepMs` apart, the last one at NOW
const samples = (count: number, stepMs: number) =>
  Array.from({ length: count }, (_, i) => ({ timestamp: NOW - (count - 1 - i) * stepMs, latency: i }));

describe('utils', () => {
  describe('getLatencyStatus', () => {
    const thresholds = {
      excellent: 30,
      good: 80,
      warning: 150,
    };

    it('should return excellent for low latency', () => {
      expect(getLatencyStatus(20, thresholds)).toBe('excellent');
      expect(getLatencyStatus(30, thresholds)).toBe('excellent');
    });

    it('should return good for moderate latency', () => {
      expect(getLatencyStatus(50, thresholds)).toBe('good');
      expect(getLatencyStatus(80, thresholds)).toBe('good');
    });

    it('should return warning for high latency', () => {
      expect(getLatencyStatus(100, thresholds)).toBe('warning');
      expect(getLatencyStatus(150, thresholds)).toBe('warning');
    });

    it('should return critical for very high latency', () => {
      expect(getLatencyStatus(200, thresholds)).toBe('critical');
      expect(getLatencyStatus(500, thresholds)).toBe('critical');
    });

    it('should return unknown for null latency', () => {
      expect(getLatencyStatus(null, thresholds)).toBe('unknown');
    });
  });

  describe('formatLatency', () => {
    it('should format latency with one decimal place', () => {
      expect(formatLatency(45.678)).toBe('45.7ms');
      expect(formatLatency(123.4)).toBe('123.4ms');
    });

    it('should return N/A for null', () => {
      expect(formatLatency(null)).toBe('N/A');
    });
  });

  describe('getStatusColor', () => {
    it('should return correct color classes', () => {
      expect(getStatusColor('excellent')).toBe('text-green-500');
      expect(getStatusColor('good')).toBe('text-yellow-500');
      expect(getStatusColor('warning')).toBe('text-orange-500');
      expect(getStatusColor('critical')).toBe('text-red-500');
      expect(getStatusColor('unknown')).toBe('text-gray-500');
    });
  });

  describe('getStatusBgColor', () => {
    it('should return correct background color classes', () => {
      expect(getStatusBgColor('excellent')).toBe('bg-green-500');
      expect(getStatusBgColor('good')).toBe('bg-yellow-500');
      expect(getStatusBgColor('warning')).toBe('bg-orange-500');
      expect(getStatusBgColor('critical')).toBe('bg-red-500');
      expect(getStatusBgColor('unknown')).toBe('bg-gray-500');
    });
  });

  describe('history helpers', () => {
    it('trimHistory drops samples older than the retention period', () => {
      const history = [
        { timestamp: NOW - HISTORY_RETENTION_MS - 1, latency: 1 },
        { timestamp: NOW - HOUR, latency: 2 },
      ];
      expect(trimHistory(history, NOW)).toEqual([{ timestamp: NOW - HOUR, latency: 2 }]);
    });

    it('trimHistory keeps a full day at 10s intervals under the sample cap', () => {
      let history: Array<{ timestamp: number; latency: number }> = [];
      // Simulate 24h of tests every 10 seconds
      for (let t = NOW - HISTORY_RETENTION_MS + 10_000; t <= NOW; t += 10_000) {
        history = trimHistory([...history, { timestamp: t, latency: 1 }], t);
      }
      expect(history.length).toBeLessThanOrEqual(MAX_HISTORY_SAMPLES);
      // Oldest sample is still from about 24h ago, newest is the latest one
      expect(NOW - history[0].timestamp).toBeGreaterThan(23 * HOUR);
      expect(history[history.length - 1].timestamp).toBe(NOW);
    });

    it('historyInRange keeps only the requested hours', () => {
      const history = samples(4 * 60, 60_000); // 4 hours, one per minute
      expect(historyInRange(history, 1, NOW).length).toBe(60);
      expect(historyInRange(history, 24, NOW).length).toBe(240);
    });

    it('downsampleHistory averages into at most maxPoints', () => {
      const result = downsampleHistory(samples(120, 1000), 60);
      expect(result.length).toBe(60);
      expect(result[0].latency).toBe(0.5);
      expect(result[59].timestamp).toBe(NOW);
      expect(downsampleHistory(samples(10, 1000), 60).length).toBe(10);
    });
  });
});
