import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, XCircle, ExternalLink, Plus, Trash2, Edit2, Check, X, Loader2, Wifi, BellOff, Bell, Settings, Globe, ChevronDown, ChevronUp, Info, Download, Upload, RotateCcw, Save } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { AppConfig, CustomEndpoint, EndpointProtocol } from '../types';
import { cn, validateThresholds, validateEndpointUrl } from '../lib/utils';
import { testLatency } from '../services/latencyService';
import { notificationsSupported, requestNotificationPermission } from '../hooks/useStatusIndicator';

const defaultPort = (protocol: EndpointProtocol) => (protocol === 'http' ? 80 : 443);

export function SettingsPanel() {
  const {
    config,
    endpoints,
    customEndpoints,
    modeInfo,
    setConfig,
    updateEndpointEnabled,
    updateEndpointMuted,
    updateBuiltInEndpoint,
    addCustomEndpoint,
    updateCustomEndpoint,
    removeCustomEndpoint,
    setCurrentView,
    exportSettings,
    importSettings,
    resetSettings,
  } = useAppStore();

  // New custom endpoint form state
  const [newEndpoint, setNewEndpoint] = useState<Partial<CustomEndpoint>>({
    name: '',
    url: '',
    port: 443,
    protocol: 'https',
    enabled: true,
  });
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency?: number; error?: string } | null>(null);

  // Edit mode state for custom endpoints
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CustomEndpoint>>({});

  // Edit mode state for mode endpoints
  const [editingModeEndpointId, setEditingModeEndpointId] = useState<string | null>(null);
  const [modeEndpointEditForm, setModeEndpointEditForm] = useState<{ name: string; url: string; port: number }>({ name: '', url: '', port: 443 });

  // Collapsible section state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    general: false,
    endpoints: false,
    data: false,
  });

  // Notification permission feedback
  const [notificationError, setNotificationError] = useState<string | null>(null);

  // Settings import / export feedback
  const importInputRef = useRef<HTMLInputElement>(null);
  const [dataMessage, setDataMessage] = useState<{ success: boolean; text: string } | null>(null);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Real-time threshold validation
  const thresholdErrors = useMemo(() => {
    return validateThresholds(config.thresholds);
  }, [config.thresholds]);

  // Safe threshold update with validation
  const handleThresholdChange = (field: 'excellent' | 'good' | 'warning', value: string) => {
    const numValue = parseInt(value) || 0;
    setConfig({
      thresholds: {
        ...config.thresholds,
        [field]: numValue,
      },
    });
  };

  // Notifications need the browser's permission before they can be enabled
  const handleNotificationsToggle = async () => {
    if (config.notificationsEnabled) {
      setNotificationError(null);
      setConfig({ notificationsEnabled: false });
      return;
    }

    if (await requestNotificationPermission()) {
      setNotificationError(null);
      setConfig({ notificationsEnabled: true });
    } else {
      setNotificationError(
        notificationsSupported()
          ? 'The browser blocked notifications for this page. Allow them in the site settings (the icon left of the address bar), or serve the page from a web server instead of opening the file directly.'
          : 'This browser does not support notifications. The tab icon and title still show the current status.'
      );
    }
  };

  // Download the current settings as a JSON file
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(exportSettings(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'avd-health-monitor-settings.json';
    link.click();
    URL.revokeObjectURL(url);
    setDataMessage({ success: true, text: 'Settings exported' });
  };

  // Load settings from a JSON file chosen by the user
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      importSettings(JSON.parse(await file.text()));
      setDataMessage({ success: true, text: `Settings imported from ${file.name}` });
    } catch (error) {
      setDataMessage({
        success: false,
        text: `Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset all settings and custom endpoints to their defaults?')) {
      resetSettings();
      setDataMessage({ success: true, text: 'Settings reset to defaults' });
    }
  };

  // Test connection to endpoint
  const handleTestConnection = async () => {
    if (!newEndpoint.url) {
      setUrlError('Please enter a URL first');
      return;
    }

    const validationError = validateEndpointUrl(newEndpoint.url);
    if (validationError) {
      setUrlError(validationError);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setUrlError(null);

    try {
      const protocol = newEndpoint.protocol || 'https';
      const latency = await testLatency(newEndpoint.url, newEndpoint.port || defaultPort(protocol), protocol);
      setTestResult({ success: true, latency });
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Add new custom endpoint
  const handleAddEndpoint = () => {
    if (!newEndpoint.name || !newEndpoint.url) return;

    const validationError = validateEndpointUrl(newEndpoint.url);
    if (validationError) {
      setUrlError(validationError);
      return;
    }

    addCustomEndpoint({
      name: newEndpoint.name,
      url: newEndpoint.url,
      port: newEndpoint.port || defaultPort(newEndpoint.protocol || 'https'),
      protocol: newEndpoint.protocol || 'https',
      category: 'Custom',
      enabled: true,
    });

    // Reset form
    setNewEndpoint({
      name: '',
      url: '',
      port: 443,
      protocol: 'https',
      enabled: true,
    });
    setUrlError(null);
    setTestResult(null);
  };

  // Start editing a custom endpoint
  const startEditing = (endpoint: CustomEndpoint) => {
    setEditingId(endpoint.id);
    setEditForm({
      name: endpoint.name,
      url: endpoint.url,
      port: endpoint.port,
      protocol: endpoint.protocol,
    });
  };

  // Save edit
  const saveEdit = () => {
    if (!editingId || !editForm.name || !editForm.url) return;

    const validationError = validateEndpointUrl(editForm.url);
    if (validationError) {
      return;
    }

    updateCustomEndpoint(editingId, editForm);
    setEditingId(null);
    setEditForm({});
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  // Start editing a built-in endpoint
  const startEditingModeEndpoint = (endpoint: { id: string; name: string; url: string; port?: number }) => {
    setEditingModeEndpointId(endpoint.id);
    setModeEndpointEditForm({
      name: endpoint.name,
      url: endpoint.url,
      port: endpoint.port || 443,
    });
  };

  // Save built-in endpoint edit
  const saveModeEndpointEdit = () => {
    if (!editingModeEndpointId || !modeEndpointEditForm.name || !modeEndpointEditForm.url) return;

    const validationError = validateEndpointUrl(modeEndpointEditForm.url);
    if (validationError) {
      return;
    }

    updateBuiltInEndpoint(editingModeEndpointId, {
      name: modeEndpointEditForm.name,
      url: modeEndpointEditForm.url,
      port: modeEndpointEditForm.port,
    });
    setEditingModeEndpointId(null);
    setModeEndpointEditForm({ name: '', url: '', port: 443 });
  };

  // Cancel built-in endpoint edit
  const cancelModeEndpointEdit = () => {
    setEditingModeEndpointId(null);
    setModeEndpointEditForm({ name: '', url: '', port: 443 });
  };

  // Group endpoints by category for display (exclude custom - they're shown separately)
  const groupedEndpoints = endpoints
    .filter((ep) => !ep.id.startsWith('custom-'))
    .reduce((acc, endpoint) => {
      const category = endpoint.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(endpoint);
      return acc;
    }, {} as Record<string, typeof endpoints>);

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
      </div>

      <div className="space-y-6">
        {/* Endpoint List Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {modeInfo.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {modeInfo.description}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Latency is measured from this browser with a small HTTPS request to each endpoint. Settings are saved in this browser only; use Export to copy them to another device.
                </p>
              </div>
            </div>
            {modeInfo.source && (
              <a
                href={modeInfo.source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 flex-shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                Microsoft Docs
              </a>
            )}
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => toggleSection('general')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                General
              </h3>
            </div>
            {collapsedSections.general ? (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            )}
          </button>

          {!collapsedSections.general && (
            <div className="px-4 pb-4 space-y-4">
              {/* Theme */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Theme
                </label>
                <select
                  value={config.theme}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'light' || value === 'dark' || value === 'nord' || value === 'cyberpunk' || value === 'system') {
                      setConfig({ theme: value satisfies AppConfig['theme'] });
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="nord">Nord Dark</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="system">System</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Endpoint Monitoring Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => toggleSection('endpoints')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Endpoint Monitoring
              </h3>
            </div>
            {collapsedSections.endpoints ? (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            )}
          </button>

          {!collapsedSections.endpoints && (
          <div className="px-4 pb-4 space-y-4">
            {/* Test Interval */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Test Interval (seconds)
              </label>
              <input
                type="number"
                min="5"
                max="300"
                value={config.testInterval}
                onChange={(e) => setConfig({ testInterval: Math.max(5, Math.min(300, parseInt(e.target.value) || 10)) })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                How often to test endpoints (5-300 seconds). Browsers slow down timers in background tabs, so tests may run only about once a minute while this tab is hidden.
              </p>
            </div>

            {/* Notifications */}
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notifications
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Show browser notifications when latency exceeds thresholds (the page must stay open)
                </p>
                {notificationError && (
                  <p className="text-xs text-red-500 mt-1 flex items-start gap-1">
                    <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {notificationError}
                  </p>
                )}
              </div>
              <button
                onClick={handleNotificationsToggle}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  config.notificationsEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    config.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            {/* Alert Threshold */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Alert Threshold (consecutive checks)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={config.alertThreshold}
                onChange={(e) => setConfig({ alertThreshold: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Number of consecutive high latency checks before showing a notification (1-10)
              </p>
            </div>

            {/* Alert Cooldown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Alert Cooldown (minutes)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={config.alertCooldown}
                onChange={(e) => setConfig({ alertCooldown: Math.max(1, Math.min(60, parseInt(e.target.value) || 5)) })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Minimum time between repeated alerts (1-60 minutes)
              </p>
            </div>

            {/* Graph Time Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Graph Time Range (hours)
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={config.graphTimeRange}
                onChange={(e) => setConfig({ graphTimeRange: Math.max(1, Math.min(24, parseInt(e.target.value) || 1)) })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Time range of history shown in endpoint graphs (1-24 hours)
              </p>
            </div>

            {/* Latency Thresholds - moved inside Endpoint Monitoring */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Latency Thresholds
              </h4>

              {/* General validation error */}
              {thresholdErrors.general && (
                <div className="p-3 mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {thresholdErrors.general}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {/* Excellent */}
                <div>
                  <label className="block text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    Excellent (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.thresholds.excellent}
                    onChange={(e) => handleThresholdChange('excellent', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:border-transparent',
                      thresholdErrors.excellent
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-green-500'
                    )}
                  />
                  {thresholdErrors.excellent && (
                    <p className="text-xs text-red-500 mt-1">{thresholdErrors.excellent}</p>
                  )}
                </div>

                {/* Good */}
                <div>
                  <label className="block text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                    Good (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.thresholds.good}
                    onChange={(e) => handleThresholdChange('good', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:border-transparent',
                      thresholdErrors.good
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-yellow-500'
                    )}
                  />
                  {thresholdErrors.good && (
                    <p className="text-xs text-red-500 mt-1">{thresholdErrors.good}</p>
                  )}
                </div>

                {/* Warning */}
                <div>
                  <label className="block text-sm font-medium text-orange-600 dark:text-orange-400 mb-2">
                    Warning (ms)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={config.thresholds.warning}
                    onChange={(e) => handleThresholdChange('warning', e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:border-transparent',
                      thresholdErrors.warning
                        ? 'border-red-500 focus:ring-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-orange-500'
                    )}
                  />
                  {thresholdErrors.warning && (
                    <p className="text-xs text-red-500 mt-1">{thresholdErrors.warning}</p>
                  )}
                </div>
              </div>

              {/* Threshold scale visualization */}
              <div className="pt-3">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>0ms</span>
                  <span className="flex-1 text-center">Latency Scale</span>
                  <span>{config.thresholds.warning + 50}ms+</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden flex">
                  <div
                    className="bg-green-500 h-full"
                    style={{ width: `${(config.thresholds.excellent / (config.thresholds.warning + 50)) * 100}%` }}
                    title={`Excellent: 0-${config.thresholds.excellent}ms`}
                  />
                  <div
                    className="bg-yellow-500 h-full"
                    style={{ width: `${((config.thresholds.good - config.thresholds.excellent) / (config.thresholds.warning + 50)) * 100}%` }}
                    title={`Good: ${config.thresholds.excellent + 1}-${config.thresholds.good}ms`}
                  />
                  <div
                    className="bg-orange-500 h-full"
                    style={{ width: `${((config.thresholds.warning - config.thresholds.good) / (config.thresholds.warning + 50)) * 100}%` }}
                    title={`Warning: ${config.thresholds.good + 1}-${config.thresholds.warning}ms`}
                  />
                  <div
                    className="bg-red-500 h-full flex-1"
                    title={`Critical: ${config.thresholds.warning + 1}ms+`}
                  />
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-green-600 dark:text-green-400">Excellent</span>
                  <span className="text-yellow-600 dark:text-yellow-400">Good</span>
                  <span className="text-orange-600 dark:text-orange-400">Warning</span>
                  <span className="text-red-600 dark:text-red-400">Critical</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Latency above {config.thresholds.warning}ms is considered Critical (red)
              </p>
            </div>

            {/* Custom Endpoints - moved inside Endpoint Monitoring */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Custom Endpoints
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Add your own endpoints to monitor alongside the default ones.
              </p>

              {/* Custom Endpoint List */}
              {customEndpoints.length > 0 && (
                <div className="space-y-2 mb-4">
                  {customEndpoints.map((endpoint) => (
                    <div
                      key={endpoint.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      {editingId === endpoint.id ? (
                        // Edit mode
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            placeholder="Name"
                            className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                          />
                          <input
                            type="text"
                            value={editForm.url || ''}
                            onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                            placeholder="URL"
                            className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                          />
                          <input
                            type="number"
                            value={editForm.port || 443}
                            onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value) || 443 })}
                            placeholder="Port"
                            className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                          />
                          <button
                            onClick={saveEdit}
                            className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        // View mode
                        <>
                          <div className="flex items-center space-x-3 flex-1">
                            <input
                              type="checkbox"
                              checked={endpoint.enabled}
                              onChange={(e) => updateEndpointEnabled(endpoint.id, e.target.checked)}
                              className="w-4 h-4 text-primary-500 bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 rounded focus:ring-primary-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">
                                {endpoint.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {endpoint.url}:{endpoint.port || 443}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => startEditing(endpoint)}
                              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                              title="Edit endpoint"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => removeCustomEndpoint(endpoint.id)}
                              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Remove endpoint"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Custom Endpoint Form */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Name (e.g., My Server)"
                    value={newEndpoint.name || ''}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.target.value })}
                    className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="URL (e.g., example.com)"
                    value={newEndpoint.url || ''}
                    onChange={(e) => {
                      setNewEndpoint({ ...newEndpoint, url: e.target.value });
                      setUrlError(null);
                      setTestResult(null);
                    }}
                    className={cn(
                      'px-3 py-2 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:border-transparent',
                      urlError
                        ? 'border-red-500 focus:ring-red-500'
                        : testResult?.success
                        ? 'border-green-500 focus:ring-green-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                    )}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    placeholder="Port"
                    value={newEndpoint.port || 443}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, port: parseInt(e.target.value) || 443 })}
                    className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <select
                    value={newEndpoint.protocol || 'https'}
                    onChange={(e) => {
                      const protocol = e.target.value as EndpointProtocol;
                      const previousDefault = defaultPort(newEndpoint.protocol || 'https');
                      // Follow the protocol's default port unless the user picked a custom one
                      const port = !newEndpoint.port || newEndpoint.port === previousDefault ? defaultPort(protocol) : newEndpoint.port;
                      setNewEndpoint({ ...newEndpoint, protocol, port });
                    }}
                    className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="https">HTTPS</option>
                    <option value="http">HTTP</option>
                  </select>
                  <button
                    onClick={handleTestConnection}
                    disabled={!newEndpoint.url || isTesting}
                    className="px-3 py-2 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 disabled:bg-gray-100 disabled:dark:bg-gray-700 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2"
                    title="Test Connection"
                  >
                    {isTesting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    <span className="text-sm">Test</span>
                  </button>
                  <button
                    onClick={handleAddEndpoint}
                    disabled={!newEndpoint.name || !newEndpoint.url || !!urlError}
                    className="px-3 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm">Add</span>
                  </button>
                </div>

                {/* URL validation error */}
                {urlError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    {urlError}
                  </p>
                )}

                {/* Test result */}
                {testResult && (
                  <div
                    className={cn(
                      'p-2 rounded-lg flex items-center gap-2 text-sm',
                      testResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                    )}
                  >
                    {testResult.success ? (
                      <>
                        <Check className="w-4 h-4" />
                        Connection successful! Latency: {testResult.latency?.toFixed(1)}ms
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" />
                        Connection failed: {testResult.error}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mode Endpoints - moved inside Endpoint Monitoring */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Built-in Endpoints
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Endpoints Microsoft lists as required for AVD clients. Uncheck to stop testing, or mute to suppress alerts.
              </p>

              {/* Endpoint List by Category */}
              <div className="space-y-4">
                {Object.entries(groupedEndpoints).map(([category, categoryEndpoints]) => (
                  <div key={category}>
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      {category}
                    </h5>
                    <div className="space-y-2">
                      {categoryEndpoints.map((endpoint) => {
                        const isMuted = endpoint.muted === true;
                        const isEditing = editingModeEndpointId === endpoint.id;

                        return (
                          <div
                            key={endpoint.id}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            {isEditing ? (
                              // Edit mode
                              <div className="flex-1 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={modeEndpointEditForm.name}
                                  onChange={(e) => setModeEndpointEditForm({ ...modeEndpointEditForm, name: e.target.value })}
                                  placeholder="Name"
                                  className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                                />
                                <input
                                  type="text"
                                  value={modeEndpointEditForm.url}
                                  onChange={(e) => setModeEndpointEditForm({ ...modeEndpointEditForm, url: e.target.value })}
                                  placeholder="URL"
                                  className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                                />
                                <input
                                  type="number"
                                  value={modeEndpointEditForm.port}
                                  onChange={(e) => setModeEndpointEditForm({ ...modeEndpointEditForm, port: parseInt(e.target.value) || 443 })}
                                  placeholder="Port"
                                  className="w-20 px-2 py-1 text-sm bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-gray-900 dark:text-white"
                                />
                                <button
                                  onClick={saveModeEndpointEdit}
                                  className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                                  title="Save"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelModeEndpointEdit}
                                  className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              // View mode
                              <>
                                <div className="flex items-center space-x-3 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={endpoint.enabled}
                                    onChange={(e) =>
                                      updateEndpointEnabled(endpoint.id, e.target.checked)
                                    }
                                    className="w-4 h-4 text-primary-500 bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 rounded focus:ring-primary-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="font-medium text-gray-900 dark:text-white truncate text-sm">
                                        {endpoint.name}
                                      </p>
                                      {isMuted && (
                                        <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                                          <BellOff className="w-3 h-3" />
                                          Muted
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {endpoint.url}:{endpoint.port || 443}
                                      {endpoint.purpose && (
                                        <span className="ml-2 text-gray-400 dark:text-gray-500">
                                          - {endpoint.purpose}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {/* Edit button */}
                                  <button
                                    onClick={() => startEditingModeEndpoint(endpoint)}
                                    className="p-2 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                                    title="Edit endpoint"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  {/* Mute/Unmute button */}
                                  <button
                                    onClick={() => updateEndpointMuted(endpoint.id, !isMuted)}
                                    className={cn(
                                      'p-2 rounded-lg transition-colors',
                                      isMuted
                                        ? 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                                        : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    )}
                                    title={isMuted ? 'Unmute alerts for this endpoint' : 'Mute alerts for this endpoint'}
                                  >
                                    {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                                  </button>
                                  {endpoint.required === false && (
                                    <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1 bg-gray-100 dark:bg-gray-600 rounded">
                                      Optional
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Backup & Restore */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => toggleSection('data')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Save className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Backup &amp; Restore
              </h3>
            </div>
            {collapsedSections.data ? (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            )}
          </button>

          {!collapsedSections.data && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Settings are stored in this browser. Export them to a file to back them up or to share a configuration with other users, who can import it.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExport}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center gap-2 text-sm"
                >
                  <Upload className="w-4 h-4" />
                  Import
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={handleReset}
                  className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2 text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to defaults
                </button>
              </div>
              {dataMessage && (
                <p
                  className={cn(
                    'text-xs flex items-center gap-1',
                    dataMessage.success ? 'text-green-600 dark:text-green-400' : 'text-red-500'
                  )}
                >
                  {dataMessage.success ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {dataMessage.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
