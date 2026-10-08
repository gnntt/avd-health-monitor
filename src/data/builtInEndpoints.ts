import endpointFile from './endpoints.json';
import type { CustomEndpoint, Endpoint, EndpointOverride, EndpointProtocol, ModeInfo } from '../types';

/**
 * Built-in AVD end-user endpoints, bundled into the page from endpoints.json.
 * User changes (enabled, muted, renamed, ...) are kept separately as overrides
 * so the defaults can be updated without losing them.
 */

export const MODE_INFO: ModeInfo = {
  name: endpointFile.name,
  description: endpointFile.description,
  source: endpointFile.source,
};

export const BUILT_IN_ENDPOINTS: Endpoint[] = endpointFile.categories.flatMap((category) =>
  category.endpoints.map((ep) => ({
    id: ep.id,
    name: ep.name,
    url: ep.url,
    region: 'global',
    enabled: true,
    muted: false,
    port: ep.port,
    protocol: ep.protocol as EndpointProtocol,
    category: category.name,
    required: ep.required,
    purpose: ep.purpose,
    latencyCritical: ep.latencyCritical,
  }))
);

export function customToEndpoint(custom: CustomEndpoint): Endpoint {
  return {
    id: custom.id,
    name: custom.name,
    url: custom.url,
    port: custom.port,
    protocol: custom.protocol,
    category: custom.category || 'Custom',
    enabled: custom.enabled,
    required: false,
    purpose: 'Custom endpoint',
    latencyCritical: custom.latencyCritical,
  };
}

/** Built-in endpoints with the user's overrides applied, followed by custom endpoints. */
export function buildEndpoints(
  overrides: Record<string, EndpointOverride>,
  customEndpoints: CustomEndpoint[]
): Endpoint[] {
  return [
    ...BUILT_IN_ENDPOINTS.map((ep) => ({ ...ep, ...overrides[ep.id] })),
    ...customEndpoints.map(customToEndpoint),
  ];
}
