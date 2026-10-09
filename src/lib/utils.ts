import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Endpoint, LatencyStatus, LatencyThresholds } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLatencyStatus(
  latency: number | null,
  thresholds: LatencyThresholds
): LatencyStatus {
  if (latency === null) return 'unknown';
  if (latency <= thresholds.excellent) return 'excellent';
  if (latency <= thresholds.good) return 'good';
  if (latency <= thresholds.warning) return 'warning';
  return 'critical';
}

export function getStatusColor(status: LatencyStatus): string {
  switch (status) {
    case 'excellent':
      return 'text-green-500';
    case 'good':
      return 'text-yellow-500';
    case 'warning':
      return 'text-orange-500';
    case 'critical':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

export function getStatusBgColor(status: LatencyStatus): string {
  switch (status) {
    case 'excellent':
      return 'bg-green-500';
    case 'good':
      return 'bg-yellow-500';
    case 'warning':
      return 'bg-orange-500';
    case 'critical':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Returns a text label for the latency status.
 * This provides accessibility for colorblind users who cannot distinguish status by color alone.
 */
export function getStatusLabel(status: LatencyStatus): string {
  switch (status) {
    case 'excellent':
      return 'OK';
    case 'good':
      return 'GOOD';
    case 'warning':
      return 'WARN';
    case 'critical':
      return 'CRIT';
    default:
      return '—';
  }
}

/**
 * Validates a URL string for endpoint configuration.
 * Returns an error message if invalid, or null if valid.
 */
export function validateEndpointUrl(url: string): string | null {
  if (!url || url.trim() === '') {
    return 'URL is required';
  }

  const trimmedUrl = url.trim();

  // Check for protocol - if present, validate full URL
  if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
    try {
      new URL(trimmedUrl);
      return null;
    } catch {
      return 'Invalid URL format';
    }
  }

  // For hostnames without protocol (like "westeurope.rdgateway.azure.com")
  // Basic validation: no spaces, contains at least one dot, valid characters
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  if (!hostnameRegex.test(trimmedUrl)) {
    return 'Invalid hostname format';
  }

  if (!trimmedUrl.includes('.')) {
    return 'Hostname must include a domain (e.g., example.com)';
  }

  return null;
}

/**
 * Validates latency thresholds to ensure logical ordering.
 * Returns an object with validation errors for each field.
 */
export function validateThresholds(thresholds: LatencyThresholds): {
  excellent: string | null;
  good: string | null;
  warning: string | null;
  general: string | null;
} {
  const errors = {
    excellent: null as string | null,
    good: null as string | null,
    warning: null as string | null,
    general: null as string | null,
  };

  if (thresholds.excellent < 0) {
    errors.excellent = 'Must be non-negative';
  }

  if (thresholds.good < 0) {
    errors.good = 'Must be non-negative';
  }

  if (thresholds.warning < 0) {
    errors.warning = 'Must be non-negative';
  }

  // Check logical ordering: excellent < good < warning
  if (thresholds.excellent >= thresholds.good) {
    errors.excellent = 'Excellent must be less than Good';
    errors.good = 'Good must be greater than Excellent';
  }

  if (thresholds.good >= thresholds.warning) {
    errors.good = errors.good || 'Good must be less than Warning';
    errors.warning = 'Warning must be greater than Good';
  }

  if (thresholds.excellent >= thresholds.warning) {
    errors.general = 'Thresholds must be in order: Excellent < Good < Warning';
  }

  return errors;
}

export function formatLatency(latency: number | null): string {
  if (latency === null) return 'N/A';
  return `${latency.toFixed(1)}ms`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function isLatencyCritical(endpoint: Endpoint): boolean {
  return endpoint.latencyCritical !== false;
}

export type HistoryPoint = { timestamp: number; latency: number };

// Longest graph time range users can pick, and so how long history is kept
export const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

// Per-endpoint sample cap so 24h of history fits in localStorage
export const MAX_HISTORY_SAMPLES = 1500;

/**
 * Drop samples older than the retention period. Above the sample cap, every
 * other sample in the older half is dropped, so the full time range stays
 * covered and only older data loses resolution.
 */
export function trimHistory(history: HistoryPoint[], now: number = Date.now()): HistoryPoint[] {
  const cutoff = now - HISTORY_RETENTION_MS;
  const recent = history.filter((p) => p.timestamp > cutoff);
  if (recent.length <= MAX_HISTORY_SAMPLES) return recent;

  const half = Math.floor(recent.length / 2);
  return [...recent.slice(0, half).filter((_, i) => i % 2 === 0), ...recent.slice(half)];
}

/** Samples from the last `hours` hours. */
export function historyInRange(history: HistoryPoint[], hours: number, now: number = Date.now()): HistoryPoint[] {
  const cutoff = now - hours * 60 * 60 * 1000;
  return history.filter((p) => p.timestamp > cutoff);
}

/** Average consecutive samples into at most `maxPoints` points for drawing. */
export function downsampleHistory(history: HistoryPoint[], maxPoints: number): HistoryPoint[] {
  if (history.length <= maxPoints) return history;

  const result: HistoryPoint[] = [];
  const bucketSize = history.length / maxPoints;
  for (let i = 0; i < maxPoints; i++) {
    const bucket = history.slice(Math.floor(i * bucketSize), Math.floor((i + 1) * bucketSize));
    if (bucket.length === 0) continue;
    result.push({
      timestamp: bucket[bucket.length - 1].timestamp,
      latency: bucket.reduce((sum, p) => sum + p.latency, 0) / bucket.length,
    });
  }
  return result;
}
