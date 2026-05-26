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
                  url: 'https://logs.example/build.log'
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
                  url: 'https://logs.example/retry.log'
                }
              }
            ]
          }),
          text: async () => ''
        } as Response;
      }

      const matchingLogRequests = fetchMock.mock.calls.filter(
        ([requestedUrl]: Parameters<typeof fetch>) => String(requestedUrl) === value
      );

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
});
