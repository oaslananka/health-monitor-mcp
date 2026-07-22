import {
  getGitLabBaseUrlAllowlist,
  isGitLabBaseUrlAllowed,
  normalizeGitLabBaseUrl
} from '../../src/gitlab-origin.js';

describe('GitLab origin policy', () => {
  const original = process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST;

  afterEach(() => {
    if (original === undefined) delete process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST;
    else process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST = original;
  });

  it('normalizes HTTPS origins and always allows GitLab.com', () => {
    expect(normalizeGitLabBaseUrl('https://gitlab.com/')).toBe('https://gitlab.com');
    expect(getGitLabBaseUrlAllowlist()).toEqual(new Set(['https://gitlab.com']));
    expect(isGitLabBaseUrlAllowed('https://gitlab.com')).toBe(true);
  });

  it('allows only explicitly configured self-hosted origins', () => {
    process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST =
      'https://gitlab.internal.example/, https://gitlab.eu.example';

    expect(getGitLabBaseUrlAllowlist()).toEqual(
      new Set([
        'https://gitlab.com',
        'https://gitlab.internal.example',
        'https://gitlab.eu.example'
      ])
    );
    expect(isGitLabBaseUrlAllowed('https://gitlab.internal.example/')).toBe(true);
    expect(isGitLabBaseUrlAllowed('https://other.example')).toBe(false);
  });

  it('rejects invalid allowlist entries instead of silently weakening policy', () => {
    process.env.HEALTH_MONITOR_GITLAB_BASE_URL_ALLOWLIST =
      'https://gitlab.internal.example, http://insecure.example';

    expect(() => getGitLabBaseUrlAllowlist()).toThrow('HTTPS origin');
  });
});
