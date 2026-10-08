import type { Endpoint, EndpointProtocol, LatencyResult } from '../types';
import { parseBackendError } from '../errors';

/**
 * Latency service for testing endpoint connectivity from the browser.
 *
 * Browsers cannot open raw TCP sockets, so each test sends a tiny `HEAD`
 * request in `no-cors` mode and times the round trip. The response itself is
 * opaque (status codes are hidden), but the request only resolves if the
 * host was reachable and the TLS handshake succeeded.
 *
 * Each test sends two requests: the first one also pays for DNS, TCP and TLS
 * setup, the second reuses the open connection and is close to the network
 * round-trip time. The lower of the two is reported.
 */

// Same timeout as the original TCP test
export const REQUEST_TIMEOUT_MS = 5000;

// Requests per test; the fastest one is reported
const SAMPLES_PER_TEST = 2;

/**
 * Build the URL to probe for an endpoint.
 * Accepts either a bare hostname ("login.microsoftonline.com") or a full URL.
 */
export function buildProbeUrl(
  endpoint: string,
  port?: number,
  protocol: EndpointProtocol = 'https'
): string {
  const trimmed = endpoint.trim();
  let url: URL;
  if (/^https?:\/\//i.test(trimmed)) {
    // A full URL already says which scheme and port to use
    url = new URL(trimmed);
  } else {
    url = new URL(`${protocol}://${trimmed}/`);
    // URL drops default ports (443 for https, 80 for http) by itself
    if (port) url.port = String(port);
  }

  // Cache buster so the browser never answers from its HTTP cache
  url.searchParams.set('_avdhm', `${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
  return url.toString();
}

// Send one request and return its round-trip time in milliseconds
async function probeOnce(url: string, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return performance.now() - start;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Connection timed out after ${timeoutMs / 1000}s`);
    }
    // fetch() hides the reason (DNS, refused, TLS, blocked by policy)
    throw new Error(
      `Network error: request failed (${error instanceof Error ? error.message : String(error)})`
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Test latency to a single endpoint.
 * @param endpoint The endpoint hostname or URL to test
 * @param port Optional port number (default: 443 for https, 80 for http)
 * @param protocol Optional protocol ('http' or 'https') (default: 'https')
 * @returns The latency in milliseconds
 * @throws Error if the endpoint is unreachable or times out
 */
export async function testLatency(
  endpoint: string,
  port?: number,
  protocol?: EndpointProtocol
): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < SAMPLES_PER_TEST; i++) {
    const latency = await probeOnce(buildProbeUrl(endpoint, port, protocol), REQUEST_TIMEOUT_MS);
    best = Math.min(best, latency);
  }
  return Math.round(best * 10) / 10;
}

/**
 * Test latency to a single endpoint and return a structured result.
 * @param endpoint The endpoint configuration
 * @returns A LatencyResult object with success/failure info
 */
export async function testEndpointLatency(endpoint: Endpoint): Promise<LatencyResult> {
  const timestamp = Date.now();

  try {
    const latency = await testLatency(endpoint.url, endpoint.port, endpoint.protocol);
    return {
      endpointId: endpoint.id,
      latency,
      timestamp,
      success: true,
    };
  } catch (error) {
    const parsedError = parseBackendError(error, endpoint.url);
    return {
      endpointId: endpoint.id,
      latency: 0,
      timestamp,
      success: false,
      error: parsedError.message,
      errorCode: parsedError.code,
    };
  }
}

/**
 * Test latency to multiple endpoints concurrently.
 * @param endpoints Array of endpoints to test
 * @returns Array of LatencyResult objects
 */
export async function testMultipleEndpoints(endpoints: Endpoint[]): Promise<LatencyResult[]> {
  const results = await Promise.all(
    endpoints.map((endpoint) => testEndpointLatency(endpoint))
  );
  return results;
}
