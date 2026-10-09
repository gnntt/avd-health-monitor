import { Check, AlertTriangle, XCircle, Loader2, WifiOff, Power, CheckCircle, BellOff, Bell } from 'lucide-react';
import type { Endpoint, EndpointStatus } from '../types';
import { cn, getStatusColor, getStatusBgColor, isLatencyCritical, historyInRange, downsampleHistory } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { useMemo, useState, useCallback } from 'react';

interface EndpointTileProps {
  endpoint: Endpoint;
  status?: EndpointStatus;
}

// Format timestamp for tooltip
function formatTooltipTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Get color for latency status
function getLatencyColor(status: string): string {
  switch (status) {
    case 'excellent': return '#22c55e'; // green-500
    case 'good': return '#eab308'; // yellow-500
    case 'warning': return '#f97316'; // orange-500
    case 'critical': return '#ef4444'; // red-500
    default: return '#6b7280'; // gray-500
  }
}

// Points drawn in a tile's graph; longer ranges are averaged down to this
const MAX_GRAPH_POINTS = 60;

// Mini sparkline graph component - simple line only
function MiniGraph({ history, graphTimeRange, isEnabled, latencyStatus }: { history: Array<{ timestamp: number; latency: number }>; graphTimeRange: number; isEnabled: boolean; latencyStatus: string }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; latency: number; timestamp: number } | null>(null);

  const graphData = useMemo(() => {
    // Samples from the configured time range, averaged down to fit the tile
    const points = downsampleHistory(historyInRange(history, graphTimeRange), MAX_GRAPH_POINTS);
    if (points.length < 2) return null;

    const latencies = points.map(p => p.latency);
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const range = max - min || 1;

    // Graph dimensions
    const width = 100;
    const height = 24;
    const padding = 2;

    // Calculate point positions
    const pointPositions = points.map((point, index) => {
      const x = padding + (index / (points.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (point.latency - min) / range) * (height - padding * 2);
      return { x, y, latency: point.latency, timestamp: point.timestamp };
    });

    // Create simple line path
    const linePath = pointPositions.map((pos, index) =>
      `${index === 0 ? 'M' : 'L'} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`
    ).join(' ');

    return { linePath, points: pointPositions, height };
  }, [history, graphTimeRange]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!graphData) return;

    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;

    // Find closest point
    let closestPoint = graphData.points[0];
    let closestDist = Math.abs(x - closestPoint.x);

    for (const point of graphData.points) {
      const dist = Math.abs(x - point.x);
      if (dist < closestDist) {
        closestDist = dist;
        closestPoint = point;
      }
    }

    setHoveredPoint(closestPoint);
  }, [graphData]);

  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);

  if (!graphData) {
    return (
      <div className="h-6 flex items-center justify-center">
        <span className="text-[9px] text-gray-400 dark:text-gray-500">No data</span>
      </div>
    );
  }

  return (
    <div className="relative h-6">
      {/* Tooltip */}
      {hoveredPoint && (
        <div
          className="absolute z-20 bg-gray-800 dark:bg-gray-700 text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: `${hoveredPoint.x}%`,
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: '4px',
          }}
        >
          <span className="font-medium">{hoveredPoint.latency.toFixed(0)} ms</span>
          <span className="text-gray-400 dark:text-gray-300 ml-1.5">{formatTooltipTime(hoveredPoint.timestamp)}</span>
        </div>
      )}
      <svg
        viewBox={`0 0 100 ${graphData.height}`}
        className={cn(
          "w-full h-full",
          !isEnabled && "opacity-50"
        )}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Simple line with status color */}
        <path
          d={graphData.linePath}
          fill="none"
          stroke={isEnabled ? getLatencyColor(latencyStatus) : "var(--color-disabled-stroke)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover dot */}
        {hoveredPoint && (
          <circle
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r="3"
            fill={isEnabled ? getLatencyColor(latencyStatus) : "var(--color-disabled-stroke)"}
          />
        )}
      </svg>
    </div>
  );
}

export function EndpointTile({ endpoint, status }: EndpointTileProps) {
  const updateEndpointEnabled = useAppStore((state) => state.updateEndpointEnabled);
  const updateEndpointMuted = useAppStore((state) => state.updateEndpointMuted);
  const graphTimeRange = useAppStore((state) => state.config.graphTimeRange);

  const latency = status?.currentLatency ?? null;
  const latencyStatus = status?.status ?? 'unknown';
  const isLoading = status?.isLoading ?? false;
  const error = status?.error ?? null;
  const isEnabled = endpoint.enabled;
  const isMuted = endpoint.muted === true;
  const history = status?.history ?? [];
  const showLatency = isLatencyCritical(endpoint);
  const isReachable = latency !== null && !error;

  // Get status icon
  const getStatusIcon = () => {
    if (isLoading) return Loader2;
    if (error) return WifiOff;
    // For non-latency-critical endpoints, just show check or X
    if (!showLatency) {
      return isReachable ? CheckCircle : XCircle;
    }
    if (latencyStatus === 'excellent' || latencyStatus === 'good') return Check;
    if (latencyStatus === 'warning') return AlertTriangle;
    if (latencyStatus === 'critical') return XCircle;
    return null;
  };

  const StatusIcon = getStatusIcon();

  // Get border color based on status
  const getBorderColor = () => {
    if (!isEnabled) return 'border-gray-300 dark:border-gray-600';
    if (isLoading) return 'border-blue-400 dark:border-blue-500';
    if (error) return 'border-red-400 dark:border-red-500';

    // For non-latency-critical endpoints, just show green (reachable) or red (unreachable)
    if (!showLatency) {
      return isReachable
        ? 'border-green-400 dark:border-green-500'
        : 'border-gray-300 dark:border-gray-600';
    }

    switch (latencyStatus) {
      case 'excellent':
        return 'border-green-400 dark:border-green-500';
      case 'good':
        return 'border-yellow-400 dark:border-yellow-500';
      case 'warning':
        return 'border-orange-400 dark:border-orange-500';
      case 'critical':
        return 'border-red-400 dark:border-red-500';
      default:
        return 'border-gray-300 dark:border-gray-600';
    }
  };

  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all p-4 border-2 relative group',
        getBorderColor(),
        !isEnabled && 'opacity-50'
      )}
    >
      {/* Controls - appear on hover */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {/* Mute/Unmute Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateEndpointMuted(endpoint.id, !isMuted);
          }}
          className={cn(
            'p-1.5 rounded',
            isMuted
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200'
          )}
          title={isMuted ? 'Unmute alerts' : 'Mute alerts'}
        >
          {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
        </button>

        {/* Enable/Disable Toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateEndpointEnabled(endpoint.id, !isEnabled);
          }}
          className={cn(
            'p-1.5 rounded',
            isEnabled
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200'
          )}
          title={isEnabled ? 'Disable endpoint' : 'Enable endpoint'}
        >
          <Power className="w-4 h-4" />
        </button>
      </div>

      {/* Muted indicator - always visible when muted */}
      {isMuted && (
        <div className="absolute top-2 left-2 z-10">
          <BellOff className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
        </div>
      )}

      {/* Status indicator and latency/reachability */}
      <div className="flex items-center gap-2 mb-2">
        {StatusIcon && (
          <div
            className={cn(
              'p-2 rounded-md',
              isEnabled
                ? showLatency
                  ? getStatusBgColor(latencyStatus)
                  : isReachable
                    ? 'bg-green-500'
                    : 'bg-gray-400 dark:bg-gray-600'
                : 'bg-gray-400 dark:bg-gray-600',
              isLoading && 'bg-blue-500',
              error && 'bg-red-500'
            )}
          >
            <StatusIcon
              className={cn('w-4 h-4 text-white', isLoading && 'animate-spin')}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <span className="text-blue-500 font-medium">Testing...</span>
          ) : error ? (
            <span className="text-red-500 font-medium truncate block" title={error.userMessage}>
              Unreachable
            </span>
          ) : showLatency ? (
            // Latency-critical: show latency value
            latency !== null ? (
              <div className="flex items-baseline gap-1">
                <span className={cn('text-2xl font-bold', getStatusColor(latencyStatus))}>
                  {latency.toFixed(0)}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">ms</span>
              </div>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">--</span>
            )
          ) : (
            // Non-latency-critical: show reachable/unreachable
            isReachable ? (
              <span className="text-green-500 dark:text-green-400 font-medium">Reachable</span>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">--</span>
            )
          )}
        </div>
      </div>

      {/* Mini Graph - only show for latency-critical endpoints */}
      {showLatency && (
        <div className="mb-2">
          <MiniGraph history={history} graphTimeRange={graphTimeRange} isEnabled={isEnabled} latencyStatus={latencyStatus} />
        </div>
      )}

      {/* Endpoint name */}
      <h3
        className="text-sm font-medium text-gray-900 dark:text-white truncate"
        title={endpoint.name}
      >
        {endpoint.name}
      </h3>

      {/* URL and port */}
      <p
        className="text-xs text-gray-500 dark:text-gray-400 truncate"
        title={`${endpoint.url}:${endpoint.port || 443}`}
      >
        {endpoint.url}
        {endpoint.port && endpoint.port !== 443 && `:${endpoint.port}`}
      </p>
    </div>
  );
}
