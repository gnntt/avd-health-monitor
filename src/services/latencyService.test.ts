import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildProbeUrl, testLatency, testEndpointLatency } from './latencyService';
import { ErrorCode } from '../errors';

const withoutCacheBuster = (url: string) => {
  const parsed = new URL(url);
  expect(parsed.searchParams.get('_avdhm')).toBeTruthy();
  parsed.searchParams.delete('_avdhm');
  return parsed.toString();
};

describe('buildProbeUrl', () => {
  it('builds an https URL from a hostname', () => {
    expect(withoutCacheBuster(buildProbeUrl('login.microsoftonline.com', 443, 'https'))).toBe(
      'https://login.microsoftonline.com/'
    );
  });

  it('defaults to https', () => {
    expect(withoutCacheBuster(buildProbeUrl('example.com'))).toBe('https://example.com/');
  });

  it('uses http and keeps non-default ports', () => {
    expect(withoutCacheBuster(buildProbeUrl('www.microsoft.com', 80, 'http'))).toBe('http://www.microsoft.com/');
    expect(withoutCacheBuster(buildProbeUrl('example.com', 8443, 'https'))).toBe('https://example.com:8443/');
  });

  it('uses a full URL as given', () => {
    expect(withoutCacheBuster(buildProbeUrl('http://example.com:8080/health', 443, 'https'))).toBe(
      'http://example.com:8080/health'
    );
  });

  it('adds a different cache buster each time', () => {
    expect(buildProbeUrl('example.com')).not.toBe(buildProbeUrl('example.com'));
  });
});

describe('testLatency', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends no-cors HEAD requests and reports the fastest sample', async () => {
    const times = [0, 300, 300, 340]; // cold request 300ms, warm request 40ms
    vi.spyOn(performance, 'now').mockImplementation(() => times.shift() ?? 0);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testLatency('example.com', 443, 'https')).resolves.toBe(40);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
    });
  });

  it('reports unreachable hosts as network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await testEndpointLatency({ id: 'x', name: 'X', url: 'nope.invalid', enabled: true });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.NETWORK_ERROR);
  });

  it('times out slow hosts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
      )
    );

    const pending = testEndpointLatency({ id: 'x', name: 'X', url: 'slow.example.com', enabled: true });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(ErrorCode.NETWORK_TIMEOUT);
  });
});
