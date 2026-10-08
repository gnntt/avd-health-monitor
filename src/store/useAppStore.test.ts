import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, DEFAULT_CONFIG, sanitizeConfig } from './useAppStore';
import { BUILT_IN_ENDPOINTS } from '../data/builtInEndpoints';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.getState().resetSettings();
    useAppStore.setState({
      endpointStatuses: new Map(),
      isMonitoring: false,
      isPaused: false,
      pendingTestTrigger: false,
    });
  });

  it('should initialize with default config', () => {
    const state = useAppStore.getState();
    expect(state.config.testInterval).toBe(10);
    expect(state.config.thresholds.excellent).toBe(30);
    expect(state.config.thresholds.good).toBe(80);
    expect(state.config.thresholds.warning).toBe(150);
    expect(state.config.notificationsEnabled).toBe(false);
  });

  it('should load the built-in end user endpoints', () => {
    const state = useAppStore.getState();
    expect(state.endpoints.length).toBe(BUILT_IN_ENDPOINTS.length);
    expect(state.endpoints[0].name).toBe('Azure AD Authentication');
    expect(state.endpoints[0].url).toBe('login.microsoftonline.com');
    expect(state.endpoints[0].category).toBe('Authentication');
    expect(state.endpoints.every((e) => e.protocol === 'https' || e.protocol === 'http')).toBe(true);
    expect(state.modeInfo.name).toBe('End User Device');
  });

  it('should update config', () => {
    const { setConfig } = useAppStore.getState();
    setConfig({ testInterval: 20 });

    const state = useAppStore.getState();
    expect(state.config.testInterval).toBe(20);
  });

  it('should add custom endpoint', () => {
    const { addCustomEndpoint } = useAppStore.getState();
    const newEndpoint = {
      name: 'Test Endpoint',
      url: 'test.example.com',
      port: 443,
      protocol: 'https' as const,
      category: 'Custom',
      enabled: true,
    };

    addCustomEndpoint(newEndpoint);

    const state = useAppStore.getState();
    expect(state.customEndpoints.length).toBe(1);
    expect(state.customEndpoints[0].name).toBe('Test Endpoint');
    // Custom endpoint should also be in the endpoints list
    expect(state.endpoints.some((e) => e.name === 'Test Endpoint')).toBe(true);
  });

  it('should update endpoint enabled state', () => {
    const state = useAppStore.getState();
    const firstEndpoint = state.endpoints[0];

    const { updateEndpointEnabled } = useAppStore.getState();
    updateEndpointEnabled(firstEndpoint.id, false);

    const updatedState = useAppStore.getState();
    const updated = updatedState.endpoints.find((e) => e.id === firstEndpoint.id);
    expect(updated?.enabled).toBe(false);
    // Endpoint status should also have updated endpoint reference
    const status = updatedState.endpointStatuses.get(firstEndpoint.id);
    if (status) {
      expect(status.endpoint.enabled).toBe(false);
    }
  });

  it('should remove custom endpoint', () => {
    const { addCustomEndpoint, removeCustomEndpoint } = useAppStore.getState();

    // First add a custom endpoint
    addCustomEndpoint({
      name: 'To Remove',
      url: 'remove.example.com',
      port: 443,
      protocol: 'https' as const,
      category: 'Custom',
      enabled: true,
    });

    let state = useAppStore.getState();
    const customEndpoint = state.customEndpoints[0];

    // Then remove it
    removeCustomEndpoint(customEndpoint.id);

    state = useAppStore.getState();
    expect(state.customEndpoints.length).toBe(0);
    expect(state.endpoints.find((e) => e.id === customEndpoint.id)).toBeUndefined();
  });

  it('should update latency', () => {
    const state = useAppStore.getState();
    const firstEndpoint = state.endpoints[0];

    const { updateLatency } = useAppStore.getState();
    updateLatency(firstEndpoint.id, 45.5, true);

    const updatedState = useAppStore.getState();
    const status = updatedState.endpointStatuses.get(firstEndpoint.id);

    expect(status).toBeDefined();
    expect(status?.currentLatency).toBe(45.5);
    expect(status?.status).toBe('good'); // 45.5ms is in the "good" range
    expect(status?.history.length).toBe(1);
  });

  it('should toggle monitoring state', () => {
    const { setMonitoring } = useAppStore.getState();

    setMonitoring(true);
    expect(useAppStore.getState().isMonitoring).toBe(true);

    setMonitoring(false);
    expect(useAppStore.getState().isMonitoring).toBe(false);
  });

  it('should toggle paused state', () => {
    const { setPaused } = useAppStore.getState();

    setPaused(true);
    expect(useAppStore.getState().isPaused).toBe(true);

    setPaused(false);
    expect(useAppStore.getState().isPaused).toBe(false);
  });

  it('should store built-in endpoint changes as overrides', () => {
    const { updateEndpointMuted, updateBuiltInEndpoint, updateEndpointEnabled } = useAppStore.getState();
    updateEndpointEnabled('eu-avd-rdweb', false);
    updateEndpointMuted('eu-avd-rdweb', true);
    updateBuiltInEndpoint('eu-avd-rdweb', { name: 'RD Web' });

    const state = useAppStore.getState();
    expect(state.endpointOverrides['eu-avd-rdweb']).toEqual({ enabled: false, muted: true, name: 'RD Web' });
    const endpoint = state.endpoints.find((e) => e.id === 'eu-avd-rdweb');
    expect(endpoint).toMatchObject({ enabled: false, muted: true, name: 'RD Web', url: 'rdweb.wvd.microsoft.com' });
  });

  it('should export and re-import settings', () => {
    const { setConfig, addCustomEndpoint, updateEndpointMuted } = useAppStore.getState();
    setConfig({ testInterval: 60, theme: 'nord' });
    addCustomEndpoint({ name: 'Mine', url: 'mine.example.com', port: 443, protocol: 'https', enabled: true });
    updateEndpointMuted('eu-graph-api', true);

    const exported = JSON.parse(JSON.stringify(useAppStore.getState().exportSettings()));
    useAppStore.getState().resetSettings();
    expect(useAppStore.getState().customEndpoints.length).toBe(0);

    useAppStore.setState({ pendingTestTrigger: false });
    useAppStore.getState().importSettings(exported);

    const state = useAppStore.getState();
    expect(state.config.testInterval).toBe(60);
    expect(state.config.theme).toBe('nord');
    expect(state.customEndpoints[0].name).toBe('Mine');
    expect(state.endpoints.find((e) => e.name === 'Mine')).toBeDefined();
    expect(state.endpoints.find((e) => e.id === 'eu-graph-api')?.muted).toBe(true);
    expect(state.pendingTestTrigger).toBe(true);
  });

  it('should import a desktop app settings.json', () => {
    useAppStore.getState().importSettings({
      version: 1,
      config: { mode: 'enduser', testInterval: 180, autoStart: true, theme: 'dark' },
      customEndpoints: [
        { id: 'custom-1', name: 'Old', url: 'old.example.com', port: 443, protocol: 'tcp', enabled: true },
      ],
    });

    const state = useAppStore.getState();
    expect(state.config).toEqual({ ...DEFAULT_CONFIG, testInterval: 180, theme: 'dark' });
    expect(state.customEndpoints[0]).toMatchObject({ id: 'custom-1', protocol: 'https', port: 443 });
  });

  it('should reject files that are not settings', () => {
    expect(() => useAppStore.getState().importSettings({ hello: 'world' })).toThrow();
    expect(() => useAppStore.getState().importSettings(null)).toThrow();
  });

  it('should clamp invalid config values', () => {
    const config = sanitizeConfig({ testInterval: 1, alertThreshold: 99, theme: 'neon', thresholds: { good: 'x' } });
    expect(config.testInterval).toBe(5);
    expect(config.alertThreshold).toBe(10);
    expect(config.theme).toBe('system');
    expect(config.thresholds.good).toBe(DEFAULT_CONFIG.thresholds.good);
  });
});
