import { useAppStore } from '../store/useAppStore';
import { EndpointTile } from './EndpointTile';
import { Info } from 'lucide-react';

export function Dashboard() {
  const endpoints = useAppStore((state) => state.endpoints);
  const endpointStatuses = useAppStore((state) => state.endpointStatuses);
  const modeInfo = useAppStore((state) => state.modeInfo);

  if (endpoints.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            No endpoints configured
          </p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
            Add a custom endpoint in Settings, or reset settings to restore the defaults
          </p>
        </div>
      </div>
    );
  }

  // Group endpoints by category
  const groupedEndpoints = endpoints.reduce((acc, endpoint) => {
    const category = endpoint.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(endpoint);
    return acc;
  }, {} as Record<string, typeof endpoints>);

  // Category display order
  const categoryOrder = [
    'Authentication',
    'AVD Services',
    'Microsoft Services',
    'Client Updates',
    'Troubleshooting',
    'Certificates',
    'Telemetry',
    'Optional Services',
    'Other',
  ];

  // Sort categories by predefined order
  const sortedCategories = Object.keys(groupedEndpoints).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  // Count enabled endpoints
  const enabledCount = endpoints.filter(ep => ep.enabled).length;

  return (
    <div className="pb-16 space-y-4">
      {/* Endpoint List Info Header */}
      {modeInfo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {modeInfo.name}
            </h3>
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
              {modeInfo.description}
            </p>
            <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">
              {enabledCount} of {endpoints.length} endpoints enabled
            </p>
          </div>
        </div>
      )}

      {/* Endpoint Categories */}
      {sortedCategories.map((category) => {
        const categoryEndpoints = groupedEndpoints[category];
        // Sort within category: enabled first
        const sortedEndpoints = [...categoryEndpoints].sort((a, b) => {
          if (a.enabled === b.enabled) return 0;
          return a.enabled ? -1 : 1;
        });

        return (
          <div key={category}>
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {category}
            </h2>
            {/* Responsive tile grid: 2 cols on mobile, 3 on md/lg, 4 on xl */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedEndpoints.map((endpoint) => {
                const status = endpointStatuses.get(endpoint.id);
                return <EndpointTile key={endpoint.id} endpoint={endpoint} status={status} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
