import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Endpoint,
  AppConfig,
  EndpointStatus,
  LatencyThresholds,
  EndpointError,
  ModeInfo,
  CustomEndpoint,
  EndpointOverride,
  SettingsFile,
} from '../types';
import { getLatencyStatus } from '../lib/utils';
import { parseBackendError, getUserFriendlyErrorMessage } from '../errors';
import { MODE_INFO, buildEndpoints, customToEndpoint } from '../data/builtInEndpoints';

const DEFAULT_THRESHOLDS: LatencyThresholds = {
  excellent: 30,
  good: 80,
  warning: 150,
};

export const DEFAULT_CONFIG: AppConfig = {
  testInterval: 10,
  thresholds: DEFAULT_THRESHOLDS,
  notificationsEnabled: false,
  theme: 'system',
  alertThreshold: 3,
  alertCooldown: 5,
  graphTimeRange: 1,
};

// Version of the exported settings file format
export const SETTINGS_FILE_VERSION = 1;

const THEMES: ReadonlyArray<AppConfig['theme']> = ['light', 'dark', 'nord', 'cyberpunk', 'system'];

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  isNumber(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;

/** Keep only known config keys with valid values (used for localStorage and imported files). */
export function sanitizeConfig(raw: unknown): AppConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = (c.thresholds && typeof c.thresholds === 'object' ? c.thresholds : {}) as Record<string, unknown>;

  return {
    testInterval: clamp(c.testInterval, 5, 300, DEFAULT_CONFIG.testInterval),
    thresholds: {
      excellent: isNumber(t.excellent) ? t.excellent : DEFAULT_THRESHOLDS.excellent,
      good: isNumber(t.good) ? t.good : DEFAULT_THRESHOLDS.good,
      warning: isNumber(t.warning) ? t.warning : DEFAULT_THRESHOLDS.warning,
    },
    notificationsEnabled:
      typeof c.notificationsEnabled === 'boolean' ? c.notificationsEnabled : DEFAULT_CONFIG.notificationsEnabled,
    theme: THEMES.includes(c.theme as AppConfig['theme']) ? (c.theme as AppConfig['theme']) : DEFAULT_CONFIG.theme,
    alertThreshold: clamp(c.alertThreshold, 1, 10, DEFAULT_CONFIG.alertThreshold),
    alertCooldown: clamp(c.alertCooldown, 1, 60, DEFAULT_CONFIG.alertCooldown),
    graphTimeRange: clamp(c.graphTimeRange, 1, 24, DEFAULT_CONFIG.graphTimeRange),
  };
}

function sanitizeCustomEndpoints(raw: unknown): CustomEndpoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((ep): ep is Record<string, unknown> =>
      !!ep && typeof ep === 'object' && typeof ep.name === 'string' && typeof ep.url === 'string'
    )
    .map((ep) => {
      // Desktop settings files used 'tcp'; the browser probes those over HTTPS
      const protocol = ep.protocol === 'http' ? 'http' : 'https';
      return {
        id: typeof ep.id === 'string' && ep.id.startsWith('custom-') ? ep.id : `custom-${crypto.randomUUID()}`,
        name: ep.name as string,
        url: ep.url as string,
        port: isNumber(ep.port) ? ep.port : protocol === 'http' ? 80 : 443,
        protocol,
        category: typeof ep.category === 'string' ? ep.category : 'Custom',
        enabled: ep.enabled !== false,
        latencyCritical: typeof ep.latencyCritical === 'boolean' ? ep.latencyCritical : undefined,
      };
    });
}

function sanitizeOverrides(raw: unknown): Record<string, EndpointOverride> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, EndpointOverride> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const override: EndpointOverride = {};
    if (typeof v.enabled === 'boolean') override.enabled = v.enabled;
    if (typeof v.muted === 'boolean') override.muted = v.muted;
    if (typeof v.name === 'string') override.name = v.name;
    if (typeof v.url === 'string') override.url = v.url;
    if (isNumber(v.port)) override.port = v.port;
    result[id] = override;
  }
  return result;
}

interface AppState {
  // Configuration
  config: AppConfig;
  endpoints: Endpoint[];
  customEndpoints: CustomEndpoint[];
  endpointOverrides: Record<string, EndpointOverride>;
  modeInfo: ModeInfo;

  // Status
  endpointStatuses: Map<string, EndpointStatus>;
  isMonitoring: boolean;
  isPaused: boolean;

  // UI State
  currentView: 'dashboard' | 'settings';

  // Flag to trigger immediate test (used after importing settings)
  pendingTestTrigger: boolean;

  // Actions
  setConfig: (config: Partial<AppConfig>) => void;
  updateEndpointEnabled: (id: string, enabled: boolean) => void;
  updateEndpointMuted: (id: string, muted: boolean) => void;
  updateBuiltInEndpoint: (id: string, updates: { name?: string; url?: string; port?: number }) => void;
  triggerTestNow: () => void;
  clearTestTrigger: () => void;

  // Custom endpoint management
  addCustomEndpoint: (endpoint: Omit<CustomEndpoint, 'id'>) => void;
  updateCustomEndpoint: (id: string, updates: Partial<CustomEndpoint>) => void;
  removeCustomEndpoint: (id: string) => void;

  // Settings file export / import
  exportSettings: () => SettingsFile;
  importSettings: (settings: unknown) => void;
  resetSettings: () => void;

  updateLatency: (endpointId: string, latency: number, success: boolean, error?: unknown) => void;
  setEndpointLoading: (endpointId: string, isLoading: boolean) => void;
  setAllEndpointsLoading: (isLoading: boolean) => void;
  clearEndpointError: (endpointId: string) => void;

  setMonitoring: (isMonitoring: boolean) => void;
  setPaused: (isPaused: boolean) => void;
  setCurrentView: (view: 'dashboard' | 'settings') => void;

  getEndpointStatus: (endpointId: string) => EndpointStatus | undefined;
}

// Storage key for localStorage
const STORAGE_KEY = 'avd-health-monitor-state';

// How long to keep history data (24 hours in milliseconds)
const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

// Serializable history entry for localStorage
interface SerializedHistory {
  [endpointId: string]: {
    history: Array<{ timestamp: number; latency: number }>;
    lastUpdated: number | null;
  };
}

// Persisted state interface (subset of AppState that we want to persist)
interface PersistedState {
  config: AppConfig;
  customEndpoints: CustomEndpoint[];
  endpointOverrides: Record<string, EndpointOverride>;
  historyData?: SerializedHistory;
}

// Helper to clean up history data older than 24 hours
const cleanupOldHistory = (
  history: Array<{ timestamp: number; latency: number }>
): Array<{ timestamp: number; latency: number }> => {
  const cutoff = Date.now() - HISTORY_RETENTION_MS;
  return history.filter((h) => h.timestamp > cutoff);
};

// Helper to serialize endpointStatuses Map to a plain object for localStorage
const serializeHistory = (statuses: Map<string, EndpointStatus>): SerializedHistory => {
  const result: SerializedHistory = {};
  statuses.forEach((status, endpointId) => {
    result[endpointId] = {
      history: cleanupOldHistory(status.history),
      lastUpdated: status.lastUpdated,
    };
  });
  return result;
};

// Helper to restore history from localStorage into endpointStatuses Map
const deserializeHistory = (
  historyData: SerializedHistory | undefined,
  endpoints: Endpoint[]
): Map<string, EndpointStatus> => {
  const statuses = new Map<string, EndpointStatus>();
  if (!historyData) return statuses;

  endpoints.forEach((endpoint) => {
    const saved = historyData[endpoint.id];
    if (saved && saved.history.length > 0) {
      const cleanedHistory = cleanupOldHistory(saved.history);
      if (cleanedHistory.length > 0) {
        statuses.set(endpoint.id, {
          endpoint,
          currentLatency: cleanedHistory[cleanedHistory.length - 1]?.latency ?? null,
          status: 'unknown',
          lastUpdated: saved.lastUpdated,
          history: cleanedHistory,
          error: null,
          isLoading: false,
        });
      }
    }
  });
  return statuses;
};

// Apply an endpoint change to both the endpoint list and the status map
const patchEndpoint = (
  state: Pick<AppState, 'endpoints' | 'endpointStatuses'>,
  id: string,
  updates: Partial<Endpoint>
): Pick<AppState, 'endpoints' | 'endpointStatuses'> => {
  const endpoints = state.endpoints.map((ep) => (ep.id === id ? { ...ep, ...updates } : ep));

  // Also update the endpoint reference in endpointStatuses so the status indicator sees the change
  const endpointStatuses = new Map(state.endpointStatuses);
  const currentStatus = endpointStatuses.get(id);
  if (currentStatus) {
    endpointStatuses.set(id, {
      ...currentStatus,
      endpoint: { ...currentStatus.endpoint, ...updates },
    });
  }

  return { endpoints, endpointStatuses };
};

const isCustomId = (id: string) => id.startsWith('custom-');

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      config: DEFAULT_CONFIG,
      endpoints: buildEndpoints({}, []),
      customEndpoints: [],
      endpointOverrides: {},
      modeInfo: MODE_INFO,
      endpointStatuses: new Map(),
      isMonitoring: false,
      isPaused: false,
      currentView: 'dashboard',
      pendingTestTrigger: false,

      // Actions
      setConfig: (config) => {
        set((state) => ({
          config: { ...state.config, ...config },
        }));
      },

      updateEndpointEnabled: (id, enabled) => {
        set((state) => {
          const patched = patchEndpoint(state, id, { enabled });

          if (isCustomId(id)) {
            const customEndpoints = state.customEndpoints.map((ep) =>
              ep.id === id ? { ...ep, enabled } : ep
            );
            return { ...patched, customEndpoints };
          }

          const endpointOverrides = {
            ...state.endpointOverrides,
            [id]: { ...state.endpointOverrides[id], enabled },
          };
          return { ...patched, endpointOverrides };
        });
      },

      updateEndpointMuted: (id, muted) => {
        set((state) => ({
          ...patchEndpoint(state, id, { muted }),
          endpointOverrides: {
            ...state.endpointOverrides,
            [id]: { ...state.endpointOverrides[id], muted },
          },
        }));
      },

      updateBuiltInEndpoint: (id, updates) => {
        set((state) => ({
          ...patchEndpoint(state, id, updates),
          endpointOverrides: {
            ...state.endpointOverrides,
            [id]: { ...state.endpointOverrides[id], ...updates },
          },
        }));
      },

      // Custom endpoint management
      addCustomEndpoint: (endpoint) => {
        const newEndpoint: CustomEndpoint = {
          ...endpoint,
          id: `custom-${crypto.randomUUID()}`,
          category: endpoint.category || 'Custom',
        };

        set((state) => ({
          customEndpoints: [...state.customEndpoints, newEndpoint],
          endpoints: [...state.endpoints, customToEndpoint(newEndpoint)],
        }));
      },

      updateCustomEndpoint: (id, updates) => {
        set((state) => {
          const customEndpoints = state.customEndpoints.map((ep) =>
            ep.id === id ? { ...ep, ...updates } : ep
          );
          const updated = customEndpoints.find((ep) => ep.id === id);
          if (!updated) return state;
          return { ...patchEndpoint(state, id, customToEndpoint(updated)), customEndpoints };
        });
      },

      removeCustomEndpoint: (id) => {
        set((state) => {
          const customEndpoints = state.customEndpoints.filter((ep) => ep.id !== id);
          const endpoints = state.endpoints.filter((ep) => ep.id !== id);
          // Also remove from statuses
          const newStatuses = new Map(state.endpointStatuses);
          newStatuses.delete(id);
          return { customEndpoints, endpoints, endpointStatuses: newStatuses };
        });
      },

      exportSettings: () => {
        const state = get();
        return {
          version: SETTINGS_FILE_VERSION,
          config: state.config,
          customEndpoints: state.customEndpoints,
          endpointOverrides: state.endpointOverrides,
        };
      },

      importSettings: (settings) => {
        if (!settings || typeof settings !== 'object' || !('config' in settings)) {
          throw new Error('Not an AVD Health Monitor settings file');
        }
        const file = settings as Partial<SettingsFile>;
        const config = sanitizeConfig(file.config);
        const customEndpoints = sanitizeCustomEndpoints(file.customEndpoints);
        const endpointOverrides = sanitizeOverrides(file.endpointOverrides);
        const endpoints = buildEndpoints(endpointOverrides, customEndpoints);

        set((state) => {
          // Keep history for endpoints that still exist
          const endpointStatuses = new Map<string, EndpointStatus>();
          endpoints.forEach((endpoint) => {
            const status = state.endpointStatuses.get(endpoint.id);
            if (status) endpointStatuses.set(endpoint.id, { ...status, endpoint });
          });
          return { config, customEndpoints, endpointOverrides, endpoints, endpointStatuses, pendingTestTrigger: true };
        });
      },

      resetSettings: () => {
        set({
          config: DEFAULT_CONFIG,
          customEndpoints: [],
          endpointOverrides: {},
          endpoints: buildEndpoints({}, []),
          endpointStatuses: new Map(),
          pendingTestTrigger: true,
        });
      },

      updateLatency: (endpointId, latency, success, error?) =>
        set((state) => {
          const endpoint = state.endpoints.find((ep) => ep.id === endpointId);
          if (!endpoint) return state;

          const newStatuses = new Map(state.endpointStatuses);
          const currentStatus = newStatuses.get(endpointId);
          const timestamp = Date.now();

          const newHistory = success
            ? [
                ...(currentStatus?.history || []).slice(-100),
                { timestamp, latency },
              ]
            : currentStatus?.history || [];

          let endpointError: EndpointError | null = null;
          if (!success && error) {
            const parsedError = parseBackendError(error, endpoint.url);
            endpointError = {
              message: parsedError.message,
              code: parsedError.code,
              timestamp,
              userMessage: getUserFriendlyErrorMessage(parsedError),
            };
          }

          const status: EndpointStatus = {
            endpoint,
            currentLatency: success ? latency : null,
            status: getLatencyStatus(success ? latency : null, state.config.thresholds),
            lastUpdated: timestamp,
            history: newHistory,
            error: success ? null : endpointError,
            isLoading: false,
          };

          newStatuses.set(endpointId, status);

          return {
            endpointStatuses: newStatuses,
          };
        }),

      setEndpointLoading: (endpointId, isLoading) =>
        set((state) => {
          const endpoint = state.endpoints.find((ep) => ep.id === endpointId);
          if (!endpoint) return state;

          const newStatuses = new Map(state.endpointStatuses);
          const currentStatus = newStatuses.get(endpointId);

          const status: EndpointStatus = currentStatus
            ? { ...currentStatus, isLoading }
            : {
                endpoint,
                currentLatency: null,
                status: 'unknown',
                lastUpdated: null,
                history: [],
                error: null,
                isLoading,
              };

          newStatuses.set(endpointId, status);

          return {
            endpointStatuses: newStatuses,
          };
        }),

      setAllEndpointsLoading: (isLoading) =>
        set((state) => {
          const newStatuses = new Map(state.endpointStatuses);

          for (const endpoint of state.endpoints.filter((ep) => ep.enabled)) {
            const currentStatus = newStatuses.get(endpoint.id);

            const status: EndpointStatus = currentStatus
              ? { ...currentStatus, isLoading }
              : {
                  endpoint,
                  currentLatency: null,
                  status: 'unknown',
                  lastUpdated: null,
                  history: [],
                  error: null,
                  isLoading,
                };

            newStatuses.set(endpoint.id, status);
          }

          return {
            endpointStatuses: newStatuses,
          };
        }),

      clearEndpointError: (endpointId) =>
        set((state) => {
          const newStatuses = new Map(state.endpointStatuses);
          const currentStatus = newStatuses.get(endpointId);

          if (currentStatus) {
            newStatuses.set(endpointId, { ...currentStatus, error: null });
          }

          return {
            endpointStatuses: newStatuses,
          };
        }),

      setMonitoring: (isMonitoring) => set({ isMonitoring }),
      setPaused: (isPaused) => set({ isPaused }),
      setCurrentView: (currentView) => set({ currentView }),
      triggerTestNow: () => set({ pendingTestTrigger: true }),
      clearTestTrigger: () => set({ pendingTestTrigger: false }),

      getEndpointStatus: (endpointId) => {
        const state = get();
        return state.endpointStatuses.get(endpointId);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedState => ({
        config: state.config,
        customEndpoints: state.customEndpoints,
        endpointOverrides: state.endpointOverrides,
        historyData: serializeHistory(state.endpointStatuses),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedState> | undefined;
        const customEndpoints = sanitizeCustomEndpoints(persisted?.customEndpoints);
        const endpointOverrides = sanitizeOverrides(persisted?.endpointOverrides);
        const endpoints = buildEndpoints(endpointOverrides, customEndpoints);
        return {
          ...currentState,
          config: persisted?.config ? sanitizeConfig(persisted.config) : currentState.config,
          customEndpoints,
          endpointOverrides,
          endpoints,
          endpointStatuses: deserializeHistory(persisted?.historyData, endpoints),
        };
      },
      version: 10,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<PersistedState>;
        if (version < 10) {
          // Migration to v10: browser-only app, endpoint overrides now live in localStorage
          return {
            config: sanitizeConfig(state.config),
            customEndpoints: state.customEndpoints || [],
            endpointOverrides: {},
            historyData: state.historyData || {},
          };
        }
        return state;
      },
    }
  )
);
