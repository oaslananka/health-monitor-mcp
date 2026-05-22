import { log } from './logging.js';
import { getAzureTimeoutMs } from './config.js';
import { fetchWithTimeout, RequestTimeoutError } from './network.js';
import { withRetry } from './retry.js';
import type { PipelineStatus } from './types.js';

const BASE = 'https://dev.azure.com';
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

type FetchLike = typeof globalThis.fetch;

let fetchImpl: FetchLike | null = null;

class AzureDevopsRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'AzureDevopsRequestError';
  }
}

function getFetchImpl(): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Global fetch is not available in this runtime');
  }

  return globalThis.fetch.bind(globalThis);
}

function isRetryableAzureError(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) {
    return false;
  }

  if (error instanceof AzureDevopsRequestError) {
    return RETRYABLE_STATUS_CODES.has(error.status);
  }

  return error instanceof Error;
}

async function azureGet(url: string, pat: string): Promise<unknown> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(
        getFetchImpl(),
        url,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`,
            'Content-Type': 'application/json'
          }
        },
        getAzureTimeoutMs(),
        'Azure DevOps request timed out'
      );

      if (!response.ok) {
        throw new AzureDevopsRequestError(
          `Azure DevOps API error: ${response.status} ${response.statusText} - ${url}`,
          response.status
        );
      }

      return response.json();
    },
    {
      attempts: 3,
      jitterRatio: 0.2,
      shouldRetry: isRetryableAzureError
    }
  );
}

async function fetchAzureLogText(logUrl: string, authHeader: string): Promise<string> {
  return withRetry(
    async () => {
      const response = await fetchWithTimeout(
        getFetchImpl(),
        logUrl,
        {
          headers: {
            Authorization: authHeader
          }
        },
        getAzureTimeoutMs(),
        'Azure DevOps request timed out'
      );

      if (!response.ok) {
        throw new AzureDevopsRequestError(
          `Azure DevOps log error: ${response.status} ${response.statusText} - ${logUrl}`,
          response.status
        );
      }

      return response.text();
    },
    {
      attempts: 3,
      jitterRatio: 0.2,
      shouldRetry: isRetryableAzureError
    }
  );
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getNestedString(value: Record<string, unknown>, ...path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    current = asObject(current)[key];
  }
  return asString(current);
}

export async function listPipelines(
  org: string,
  project: string,
  pat: string
): Promise<Array<{ id: number | null; name: string }>> {
  const url = `${BASE}/${org}/${project}/_apis/pipelines?api-version=7.1`;
  const data = asObject(await azureGet(url, pat));
  const value = Array.isArray(data.value) ? data.value : [];

  return value
    .map((item) => {
      const record = asObject(item);
      const name = asString(record.name);

      if (!name) {
        return null;
      }

      return {
        id: asNumber(record.id),
        name
      };
    })
    .filter((item): item is { id: number | null; name: string } => item !== null);
}

export async function getLatestRun(
  org: string,
  project: string,
  pipelineId: number,
  pat: string
): Promise<PipelineStatus | null> {
  try {
    const url = `${BASE}/${org}/${project}/_apis/build/builds?definitions=${pipelineId}&$top=1&api-version=7.1`;
    const data = asObject(await azureGet(url, pat));
    const build = Array.isArray(data.value) ? asObject(data.value[0]) : {};

    if (!Object.keys(build).length) {
      return null;
    }

    const id = asNumber(build.id);
    const definitionName = getNestedString(build, 'definition', 'name');
    const buildNumber = asString(build.buildNumber);

    if (id === null || !definitionName || !buildNumber) {
      return null;
    }

    return {
      name: definitionName,
      id,
      status: mapStatus(asString(build.status), asString(build.result)),
      result: asString(build.result),
      build_number: buildNumber,
      source_branch: (asString(build.sourceBranch) ?? '').replace('refs/heads/', ''),
      start_time: asString(build.startTime),
      finish_time: asString(build.finishTime),
      requested_by: getNestedString(build, 'requestedFor', 'displayName') ?? 'unknown',
      url: `https://dev.azure.com/${org}/${project}/_build/results?buildId=${id}`
    };
  } catch (error) {
    log('error', 'Failed to get latest run', { pipelineId, error: String(error) });
    return null;
  }
}

export async function getPipelineLogs(
  org: string,
  project: string,
  buildId: number,
  pat: string,
  failedOnly: boolean
): Promise<string> {
  const timelineUrl = `${BASE}/${org}/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.1`;
  const timeline = asObject(await azureGet(timelineUrl, pat));
  const records = Array.isArray(timeline.records) ? timeline.records.map(asObject) : [];
  const selected = records.filter((record) =>
    failedOnly
      ? asString(record.result) === 'failed' && getNestedString(record, 'log', 'url')
      : getNestedString(record, 'log', 'url')
  );

  if (!selected.length) {
    return 'No failed steps found or logs not available yet.';
  }

  const authHeader = `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`;
  const parts: string[] = [];

  for (const record of selected.slice(0, 5)) {
    const logUrl = getNestedString(record, 'log', 'url');
    const stepName = asString(record.name) ?? 'unknown-step';
    const result = asString(record.result) ?? 'unknown';

    if (!logUrl) {
      continue;
    }

    try {
      const text = await fetchAzureLogText(logUrl, authHeader);
      const relevant = text.split('\n').slice(-50).join('\n');
      parts.push(`\n=== ${stepName} (${result}) ===\n${relevant}`);
    } catch {
      parts.push(`\n=== ${stepName} - log fetch failed ===`);
    }
  }

  return parts.join('\n');
}

function mapStatus(status: string | null, result: string | null): PipelineStatus['status'] {
  if (status === 'inProgress') {
    return 'inProgress';
  }

  if (status === 'notStarted') {
    return 'notStarted';
  }

  if (status === 'completed') {
    if (result === 'succeeded') {
      return 'succeeded';
    }
    if (result === 'failed') {
      return 'failed';
    }
    if (result === 'canceled') {
      return 'canceled';
    }
  }

  return 'unknown';
}

export function setAzureDevopsFetchForTests(nextFetch: FetchLike): void {
  fetchImpl = nextFetch;
}

export function resetAzureDevopsFetchForTests(): void {
  fetchImpl = null;
}
