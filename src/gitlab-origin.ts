export const DEFAULT_GITLAB_BASE_URL = 'https://gitlab.com';

const INVALID_ORIGIN_MESSAGE =
  'GitLab base URL must be an HTTPS origin without credentials, path, query, or fragment';

export function normalizeGitLabBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(INVALID_ORIGIN_MESSAGE);
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(INVALID_ORIGIN_MESSAGE);
  }

  return url.origin;
}

export function getGitLabBaseUrlAllowlist(
  raw = process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST
): Set<string> {
  const origins = new Set<string>([DEFAULT_GITLAB_BASE_URL]);

  for (const entry of raw?.split(',') ?? []) {
    const value = entry.trim();
    if (value) {
      origins.add(normalizeGitLabBaseUrl(value));
    }
  }

  return origins;
}

export function isGitLabBaseUrlAllowed(
  value: string,
  allowlist = getGitLabBaseUrlAllowlist()
): boolean {
  try {
    return allowlist.has(normalizeGitLabBaseUrl(value));
  } catch {
    return false;
  }
}

export function assertGitLabBaseUrlAllowed(value: string): string {
  const normalized = normalizeGitLabBaseUrl(value);

  if (!getGitLabBaseUrlAllowlist().has(normalized)) {
    throw new Error(
      `${normalized} is not allowed; add it to HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST`
    );
  }

  return normalized;
}
