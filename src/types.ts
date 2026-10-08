export interface Endpoint {
  id: string;
  name: string;
  url: string;
  region?: string;
  enabled: boolean;
  muted?: boolean; // If true, endpoint is monitored but alerts are suppressed
  port?: number; // Default: 443 for HTTPS, 80 for HTTP
  protocol?: EndpointProtocol; // Default: 'https'
  category?: string; // For grouping endpoints (e.g., 'Authentication', 'AVD Services', 'Certificates')
  required?: boolean; // Whether this endpoint is required or optional
  purpose?: string; // Description of what this endpoint is for
  latencyCritical?: boolean; // If true, show latency in ms; if false, just show reachable/unreachable
}

// The browser can only probe endpoints over HTTP(S)
export type EndpointProtocol = 'http' | 'https';

// Description of the built-in endpoint list
export interface ModeInfo {
  name: string;
  description?: string;
  source?: string;
}

export interface LatencyResult {
  endpointId: string;
  latency: number;
  timestamp: number;
  success: boolean;
  error?: string;
  errorCode?: string;
}

// Error state for endpoint testing
export interface EndpointError {
  message: string;
  code: string;
  timestamp: number;
  userMessage: string; // User-friendly error message
}

export interface LatencyThresholds {
  excellent: number;  // 0-30ms
  good: number;       // 31-80ms
  warning: number;    // 81-150ms
  // critical: 150ms+
}

export interface AppConfig {
  testInterval: number; // seconds
  thresholds: LatencyThresholds;
  notificationsEnabled: boolean;
  theme: 'light' | 'dark' | 'nord' | 'cyberpunk' | 'system';
  alertThreshold: number; // Number of consecutive high latency checks before showing notification
  alertCooldown: number; // Minutes between repeated alerts (default: 5)
  graphTimeRange: number; // Hours of history to show in graph (default: 1)
}

// Custom endpoint added by user (stored in browser localStorage)
export interface CustomEndpoint {
  id: string;
  name: string;
  url: string;
  port?: number;
  protocol?: EndpointProtocol;
  category?: string;
  enabled: boolean;
  latencyCritical?: boolean; // If true, show latency in ms; if false, just show reachable/unreachable
}

// User changes to a built-in endpoint (stored in browser localStorage)
export interface EndpointOverride {
  enabled?: boolean;
  muted?: boolean;
  name?: string;
  url?: string;
  port?: number;
}

// Exported settings file structure (Settings > Export / Import)
export interface SettingsFile {
  version: number;
  config: AppConfig;
  customEndpoints?: CustomEndpoint[];
  endpointOverrides?: Record<string, EndpointOverride>;
}

export interface LatencyHistory {
  endpointId: string;
  data: Array<{
    timestamp: number;
    latency: number;
  }>;
}

export type LatencyStatus = 'excellent' | 'good' | 'warning' | 'critical' | 'unknown';

export interface EndpointStatus {
  endpoint: Endpoint;
  currentLatency: number | null;
  status: LatencyStatus;
  lastUpdated: number | null;
  history: LatencyHistory['data'];
  error: EndpointError | null; // Current error state if test failed
  isLoading: boolean; // Whether a test is currently running
}
