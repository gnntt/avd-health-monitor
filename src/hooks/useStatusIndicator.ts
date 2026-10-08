import { useEffect, useRef, useCallback } from 'react';
import type { LatencyStatus, LatencyThresholds, EndpointStatus } from '../types';
import { getLatencyStatus, getStatusLabel } from '../lib/utils';

/**
 * Browser replacement for the desktop tray icon:
 * - colors the tab's favicon and prefixes the tab title with the average latency
 * - shows a browser notification when endpoints stay slow, if the user allowed it
 */

const APP_TITLE = 'AVD Health Monitor';

// Same colors the tray icon used
const STATUS_COLORS: Record<LatencyStatus, string> = {
  excellent: '#22c55e',
  good: '#eab308',
  warning: '#f97316',
  critical: '#ef4444',
  unknown: '#9ca3af',
};

export function faviconDataUrl(status: LatencyStatus): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="15" fill="${STATUS_COLORS[status]}"/>` +
    `<circle cx="16" cy="16" r="6" fill="#ffffff" fill-opacity="0.8"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function setFavicon(status: LatencyStatus): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = faviconDataUrl(status);
}

/** Whether this browser lets the page show notifications at all. */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Ask for notification permission. Returns true if notifications can be shown.
 * Some browsers refuse permission for pages opened from a local file.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

function showNotification(title: string, body: string): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, { body, tag: 'avd-health-monitor', icon: faviconDataUrl('critical') });
    return true;
  } catch (error) {
    console.error('[useStatusIndicator] Failed to show notification:', error);
    return false;
  }
}

interface UseStatusIndicatorProps {
  averageLatency: number | null;
  thresholds: LatencyThresholds;
  notificationsEnabled: boolean;
  isPaused: boolean;
  /** Endpoint statuses for detailed notifications */
  endpointStatuses: Map<string, EndpointStatus>;
  /** Number of consecutive high latency checks before showing notification (default: 3) */
  alertThreshold?: number;
  /** Minutes between repeated alerts (default: 5) */
  alertCooldown?: number;
}

export function useStatusIndicator({
  averageLatency,
  thresholds,
  notificationsEnabled,
  isPaused,
  endpointStatuses,
  alertThreshold = 3,
  alertCooldown = 5,
}: UseStatusIndicatorProps) {
  // Track last notification time for cooldown enforcement
  const lastNotificationTime = useRef<number>(0);
  // Track consecutive high latency checks
  const consecutiveHighLatencyCount = useRef<number>(0);
  // Track previous average latency to detect new test cycles
  const previousLatency = useRef<number | null>(null);

  // Update favicon and tab title when latency changes
  useEffect(() => {
    const status = getLatencyStatus(averageLatency, thresholds);
    setFavicon(status);

    if (averageLatency === null) {
      document.title = APP_TITLE;
    } else {
      const prefix = isPaused ? '⏸ ' : '';
      document.title = `${prefix}${Math.round(averageLatency)} ms · ${APP_TITLE}`;
    }
  }, [averageLatency, thresholds, isPaused]);

  // Build detailed notification message with endpoint names (excludes muted and non-latency-critical endpoints)
  const buildNotificationBody = useCallback(
    (avgLatency: number, status: LatencyStatus): string => {
      const lines: string[] = [];

      // Add average latency with status label for accessibility
      lines.push(`Average: ${avgLatency.toFixed(1)}ms [${getStatusLabel(status)}]`);

      const criticalEndpoints: string[] = [];
      const warningEndpoints: string[] = [];

      endpointStatuses.forEach((epStatus) => {
        if (epStatus.endpoint.muted === true) return;
        if (epStatus.endpoint.latencyCritical === false) return;

        const epLatency = epStatus.currentLatency;
        const epName = epStatus.endpoint.name;

        if (epStatus.status === 'critical' && epLatency !== null) {
          criticalEndpoints.push(`${epName}: ${epLatency.toFixed(0)}ms`);
        } else if (epStatus.status === 'warning' && epLatency !== null) {
          warningEndpoints.push(`${epName}: ${epLatency.toFixed(0)}ms`);
        }
      });

      if (criticalEndpoints.length > 0) {
        lines.push(`Critical: ${criticalEndpoints.join(', ')}`);
      }
      if (warningEndpoints.length > 0) {
        lines.push(`Warning: ${warningEndpoints.join(', ')}`);
      }

      return lines.join('\n');
    },
    [endpointStatuses]
  );

  // Check if there are any non-muted, latency-critical endpoints with warning/critical status
  const hasNonMutedAlerts = useCallback((): boolean => {
    for (const epStatus of endpointStatuses.values()) {
      if (epStatus.endpoint.muted === true) continue;
      // Non-latency-critical endpoints only check reachability, not latency
      if (epStatus.endpoint.latencyCritical === false) continue;

      if (epStatus.status === 'warning' || epStatus.status === 'critical') {
        return true;
      }
    }
    return false;
  }, [endpointStatuses]);

  // Send a notification when any non-muted endpoint stays at warning or critical status
  // Respects consecutive check threshold and cooldown period
  useEffect(() => {
    if (!notificationsEnabled || averageLatency === null) return;

    // Only process if this is a new test result (latency value changed)
    const isNewTestResult = previousLatency.current !== averageLatency;
    previousLatency.current = averageLatency;
    if (!isNewTestResult) return;

    if (!hasNonMutedAlerts()) {
      // Reset consecutive counter when all endpoints are healthy
      consecutiveHighLatencyCount.current = 0;
      return;
    }

    consecutiveHighLatencyCount.current += 1;

    const cooldownMs = alertCooldown * 60 * 1000;
    const isCooldownExpired =
      lastNotificationTime.current === 0 || Date.now() - lastNotificationTime.current >= cooldownMs;
    const meetsThreshold = consecutiveHighLatencyCount.current >= alertThreshold;

    if (!meetsThreshold || !isCooldownExpired) return;

    const status = getLatencyStatus(averageLatency, thresholds);
    const title = status === 'critical' ? 'Critical Latency Detected' : 'High Latency Warning';

    if (showNotification(title, buildNotificationBody(averageLatency, status))) {
      lastNotificationTime.current = Date.now();
      // Reset counter after notification is sent
      consecutiveHighLatencyCount.current = 0;
    }
  }, [averageLatency, thresholds, notificationsEnabled, alertThreshold, alertCooldown, buildNotificationBody, hasNonMutedAlerts]);
}
