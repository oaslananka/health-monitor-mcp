import { jest } from '@jest/globals';

import {
  getLatestRun,
  getPipelineLogs,
  listPipelines,
  resetAzureDevopsFetchForTests,
  setAzureDevopsFetchForTests
} from '../../src/azure-devops.js';

describe('azure-devops', () => {
  beforeEach(() => {
    resetAzureDevopsFetchForTests();
    delete process.env.HEALTH_MONITOR_AZURE_TIMEOUT_MS;
  });

  afterEach(() => {
    resetAzureDevopsFetchForTests();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.HEALTH_MONITOR_AZURE_TIMEOUT_MS;
  });

  it('lists pipelines from Azure DevOps', async () => {
    setAzureDevopsFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            value: [
              { id: 1, name: 'CI' },
              { id: 2, name: 'Publish' }
            ]
          }),
          text: async () => ''
        }) as Response) as typeof fetch
    );

    await expect(listPipelines('org', 'project', 'token')).resolves.toEqual([
      { id: 1, name: 'CI' },
      { id: 2, name: 'Publish' }
    ]);
  });

  it('retries transient Azure API failures before succeeding', async () => {
    jest.useFakeTimers();

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({}),
        text: async () => ''
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          value: [{ id: 7, name: 'Retry CI' }]
        }),
        text: async () => ''
      } as Response);

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    const pipelinesPromise = listPipelines('org', 'project', 'token');
    await jest.runAllTimersAsync();

    await expect(pipelinesPromise).resolves.toEqual([{ id: 7, name: 'Retry CI' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps the latest run into monitor status shape', async () => {
    setAzureDevopsFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            value: [
              {
                id: 42,
                status: 'completed',
                result: 'failed',
                buildNumber: '20260323.4',
                sourceBranch: 'refs/heads/main',
                startTime: '2026-03-23T12:00:00.000Z',
                finishTime: '2026-03-23T12:05:00.000Z',
                requestedFor: { displayName: 'Release Bot' },
                definition: { name: 'Publish' }
              }
            ]
          }),
          text: async () => ''
        }) as Response) as typeof fetch
    );

    await expect(getLatestRun('org', 'project', 1, 'token')).resolves.toEqual(
      expect.objectContaining({
        id: 42,
        name: 'Publish',
        status: 'failed',
        source_branch: 'main'
      })
    );
  });

  it('returns relevant tail logs for failed timeline records', async () => {
    const fetchMock = jest.fn(async (url: string | URL) => {
      const value = String(url);

      if (value.includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'unit-tests',
                result: 'failed',
                log: {
                  url: 'https://dev.azure.com/org/project/_apis/build/builds/42/logs/7?api-version=7.1'
                }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => Array.from({ length: 60 }, (_, index) => `line-${index + 1}`).join('\n')
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    const logs = await getPipelineLogs('org', 'project', 42, 'token', true);

    expect(logs).toContain('unit-tests');
    expect(logs).toContain('line-60');
    expect(logs).not.toContain('line-1\nline-2');
  });

  it('retries transient log fetch failures before returning the log tail', async () => {
    jest.useFakeTimers();

    const fetchMock = jest.fn(async (url: string | URL) => {
      const value = String(url);

      if (value.includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'publish',
                result: 'failed',
                log: {
                  url: 'https://dev.azure.com/org/project/_apis/build/builds/84/logs/9?api-version=7.1'
                }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      const matchingLogRequests = fetchMock.mock.calls.filter((call) => String(call[0]) === value);

      if (matchingLogRequests.length === 1) {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({}),
          text: async () => ''
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => 'header\nfinal-line'
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    const logsPromise = getPipelineLogs('org', 'project', 84, 'token', true);
    await jest.runAllTimersAsync();

    await expect(logsPromise).resolves.toContain('final-line');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('encodes organization and project path values in Azure API URLs', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ value: [] }),
      text: async () => ''
    } as Response);

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    await listPipelines('org name', 'project/name & team', 'token');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://dev.azure.com/org%20name/project%2Fname%20%26%20team/_apis/pipelines?api-version=7.1'
    );
  });

  it('accepts organization-scoped legacy Azure DevOps log URLs', async () => {
    const fetchMock = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);

      if (value.includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'legacy-log',
                result: 'failed',
                log: {
                  url: 'https://org.visualstudio.com/project/_apis/build/builds/42/logs/7'
                }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      expect(init?.headers).toEqual(
        expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) })
      );
      expect(init?.redirect).toBe('manual');

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => 'legacy-log-line'
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    await expect(getPipelineLogs('org', 'project', 42, 'token', true)).resolves.toContain(
      'legacy-log-line'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['not a url', 'malformed-url'],
    ['http://dev.azure.com/org/project/_apis/build/builds/42/logs/7', 'https-required'],
    [
      'https://user:password@dev.azure.com/org/project/_apis/build/builds/42/logs/7',
      'userinfo-not-allowed'
    ],
    [
      'https://dev.azure.com.evil.test/org/project/_apis/build/builds/42/logs/7',
      'untrusted-origin'
    ],
    ['https://dev.azure.com/org/project/_apis/build/builds/999/logs/7', 'unexpected-log-path']
  ])('rejects unsafe timeline log URL %s with code %s', async (logUrl, expectedCode) => {
    const fetchMock = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          records: [
            {
              name: 'unsafe-log',
              result: 'failed',
              log: { url: logUrl }
            }
          ]
        }),
        text: async () => 'must-not-be-fetched'
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    const logs = await getPipelineLogs('org', 'project', 42, 'sensitive-token', true);

    expect(logs).toContain(`log fetch rejected (${expectedCode})`);
    expect(logs).not.toContain(logUrl);
    expect(logs).not.toContain('sensitive-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a validated same-origin redirect with authorization', async () => {
    const authHeaders: string[] = [];
    const fetchMock = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);

      if (value.includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'redirected-log',
                result: 'failed',
                log: {
                  url: 'https://dev.azure.com/org/project/_apis/build/builds/42/logs/7'
                }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      authHeaders.push(
        String((init?.headers as Record<string, string> | undefined)?.Authorization)
      );
      expect(init?.redirect).toBe('manual');

      if (value.endsWith('/logs/7')) {
        return {
          ok: false,
          status: 302,
          statusText: 'Found',
          headers: new Headers({
            Location: '/org/project/_apis/build/builds/42/logs/8?api-version=7.1'
          }),
          json: async () => ({}),
          text: async () => ''
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => ({}),
        text: async () => 'redirected-log-line'
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    await expect(getPipelineLogs('org', 'project', 42, 'token', true)).resolves.toContain(
      'redirected-log-line'
    );
    expect(authHeaders).toHaveLength(2);
    expect(authHeaders.every((header) => header.startsWith('Basic '))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects cross-origin redirects before forwarding authorization', async () => {
    const trustedLogUrl = 'https://dev.azure.com/org/project/_apis/build/builds/42/logs/7';
    const hostileUrl = 'https://evil.example/steal';
    const fetchMock = jest.fn(async (url: string | URL | Request) => {
      const value = String(url);

      if (value.includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'cross-origin-log',
                result: 'failed',
                log: { url: trustedLogUrl }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      if (value === hostileUrl) {
        throw new Error('Hostile redirect must not be requested');
      }

      return {
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers({ Location: hostileUrl }),
        json: async () => ({}),
        text: async () => ''
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    const logs = await getPipelineLogs('org', 'project', 42, 'sensitive-token', true);

    expect(logs).toContain('log fetch rejected (cross-origin-redirect)');
    expect(logs).not.toContain(hostileUrl);
    expect(logs).not.toContain('sensitive-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns redacted security diagnostics for redirect policy violations', async () => {
    const logUrl = 'https://dev.azure.com/org/project/_apis/build/builds/42/logs/7';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = jest.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'missing-location',
                result: 'failed',
                log: { url: logUrl }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      return {
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers(),
        json: async () => ({}),
        text: async () => ''
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    const logs = await getPipelineLogs('org', 'project', 42, 'sensitive-token', true);
    const warning = String(warnSpy.mock.calls[0]?.[0]);

    expect(logs).toContain('log fetch rejected (missing-redirect-location)');
    expect(warning).toContain('missing-redirect-location');
    expect(warning).not.toContain(logUrl);
    expect(warning).not.toContain('sensitive-token');
  });

  it('stops after the bounded same-origin redirect limit', async () => {
    const fetchMock = jest.fn(async (url: string | URL | Request) => {
      const value = String(url);

      if (value.includes('/timeline')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            records: [
              {
                name: 'redirect-loop',
                result: 'failed',
                log: {
                  url: 'https://dev.azure.com/org/project/_apis/build/builds/42/logs/1'
                }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      const logId = Number(value.match(/\/logs\/(\d+)/)?.[1] ?? 1);
      return {
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers({
          Location: `/org/project/_apis/build/builds/42/logs/${logId + 1}`
        }),
        json: async () => ({}),
        text: async () => ''
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    await expect(getPipelineLogs('org', 'project', 42, 'token', true)).resolves.toContain(
      'log fetch rejected (redirect-limit-exceeded)'
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('passes an AbortSignal to Azure API requests', async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ value: [] }),
        text: async () => ''
      } as Response;
    });

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    await listPipelines('org', 'project', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://dev.azure.com/org/project'),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('classifies Azure request aborts as timeouts', async () => {
    process.env.HEALTH_MONITOR_AZURE_TIMEOUT_MS = '25';
    setAzureDevopsFetchForTests((async (_url: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }) as typeof fetch);

    await expect(listPipelines('org', 'project', 'token')).rejects.toThrow(
      'Azure DevOps request timed out'
    );
  });

  it('filters malformed pipeline records and preserves null ids', async () => {
    setAzureDevopsFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            value: [
              { id: 5, name: 'Valid' },
              { id: 'bad', name: 'Missing numeric id' },
              { id: 6 },
              null
            ]
          }),
          text: async () => ''
        }) as Response) as typeof fetch
    );

    await expect(listPipelines('org', 'project', 'token')).resolves.toEqual([
      { id: 5, name: 'Valid' },
      { id: null, name: 'Missing numeric id' }
    ]);
  });

  it('returns null for empty or malformed latest run payloads', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ value: [] }),
        text: async () => ''
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ value: [{ id: 'bad', definition: {}, buildNumber: null }] }),
        text: async () => ''
      } as Response);

    setAzureDevopsFetchForTests(fetchMock as typeof fetch);

    await expect(getLatestRun('org', 'project', 1, 'token')).resolves.toBeNull();
    await expect(getLatestRun('org', 'project', 1, 'token')).resolves.toBeNull();
  });

  it.each([
    ['inProgress', null, 'inProgress'],
    ['notStarted', null, 'notStarted'],
    ['completed', 'succeeded', 'succeeded'],
    ['completed', 'canceled', 'canceled'],
    ['completed', 'other', 'unknown']
  ])('maps Azure run status %s/%s to %s', async (status, result, expectedStatus) => {
    setAzureDevopsFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            value: [
              {
                id: 9,
                status,
                result,
                buildNumber: '20260625.1',
                sourceBranch: 'refs/tags/v1.0.0',
                definition: { name: 'CI' },
                requestedFor: {}
              }
            ]
          }),
          text: async () => ''
        }) as Response) as typeof fetch
    );

    await expect(getLatestRun('org', 'project', 1, 'token')).resolves.toEqual(
      expect.objectContaining({
        status: expectedStatus,
        source_branch: 'refs/tags/v1.0.0',
        requested_by: 'unknown'
      })
    );
  });

  it('returns a friendly message when no timeline logs are selectable', async () => {
    setAzureDevopsFetchForTests(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ records: [{ name: 'build', result: 'succeeded' }] }),
          text: async () => ''
        }) as Response) as typeof fetch
    );

    await expect(getPipelineLogs('org', 'project', 42, 'token', true)).resolves.toBe(
      'No failed steps found or logs not available yet.'
    );
  });
});
