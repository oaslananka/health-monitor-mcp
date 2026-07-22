import {
  assertHttpTargetUrlAllowed,
  isPublicIpAddress,
  normalizeHttpTargetUrl,
  resetHttpTargetPolicyRuntimeForTests,
  setHttpTargetPolicyRuntimeForTests
} from '../../src/http-target-policy.js';

describe('HTTP target SSRF policy', () => {
  const originalAllowlist = process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST;

  afterEach(() => {
    resetHttpTargetPolicyRuntimeForTests();
    if (originalAllowlist === undefined) delete process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST;
    else process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = originalAllowlist;
  });

  it('normalizes HTTP URLs while rejecting credentials, fragments, and unsafe schemes', () => {
    expect(normalizeHttpTargetUrl('https://example.com:443/health?ready=1')).toBe(
      'https://example.com/health?ready=1'
    );
    expect(normalizeHttpTargetUrl('http://example.com:80/')).toBe('http://example.com/');

    for (const value of [
      'file:///etc/passwd',
      'https://user:pass@example.com/health',
      'https://example.com/health#secret',
      'http://'
    ]) {
      expect(() => normalizeHttpTargetUrl(value)).toThrow('HTTP target URL');
    }
  });

  it('classifies public and non-public IPv4 and IPv6 addresses', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
      expect(isPublicIpAddress(address)).toBe(true);
    }

    for (const address of [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '192.0.2.10',
      '198.18.0.1',
      '198.51.100.10',
      '203.0.113.10',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '::ffff:127.0.0.1',
      '::ffff:192.168.1.1'
    ]) {
      expect(isPublicIpAddress(address)).toBe(false);
    }
  });

  it('rejects blocked local hostnames and mixed public-private DNS answers', async () => {
    setHttpTargetPolicyRuntimeForTests({
      lookup: async (hostname) => {
        if (hostname === 'mixed.example') {
          return [
            { address: '8.8.8.8', family: 4 as const },
            { address: '10.0.0.5', family: 4 as const }
          ];
        }
        return [{ address: '8.8.8.8', family: 4 as const }];
      }
    });

    for (const hostname of [
      'localhost',
      'api.localhost',
      'service.local',
      'service.internal',
      'x.home.arpa'
    ]) {
      await expect(
        assertHttpTargetUrlAllowed(`https://${hostname}/health`, 'full')
      ).rejects.toThrow('non-public network');
    }

    await expect(
      assertHttpTargetUrlAllowed('https://mixed.example/health', 'full')
    ).rejects.toThrow('non-public address');
  });

  it('permits exact-origin private targets only in the full profile', async () => {
    process.env.HEALTH_MONITOR_HTTP_TARGET_ALLOWLIST = 'https://status.internal.example:8443';
    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [{ address: '10.20.30.40', family: 4 as const }]
    });

    await expect(
      assertHttpTargetUrlAllowed('https://status.internal.example:8443/health', 'full')
    ).resolves.toEqual(
      expect.objectContaining({
        origin: 'https://status.internal.example:8443',
        selected_address: '10.20.30.40',
        allow_private_network: true
      })
    );

    await expect(
      assertHttpTargetUrlAllowed('https://status.internal.example:8443/health', 'remote-safe')
    ).rejects.toThrow('remote-safe');
    await expect(
      assertHttpTargetUrlAllowed('https://other.internal.example:8443/health', 'full')
    ).rejects.toThrow('non-public address');
  });

  it('rejects empty DNS answers and returns deterministic public resolution', async () => {
    setHttpTargetPolicyRuntimeForTests({ lookup: async () => [] });
    await expect(
      assertHttpTargetUrlAllowed('https://empty.example/health', 'full')
    ).rejects.toThrow('did not resolve');

    setHttpTargetPolicyRuntimeForTests({
      lookup: async () => [
        { address: '2606:4700:4700::1111', family: 6 as const },
        { address: '1.1.1.1', family: 4 as const },
        { address: '1.1.1.1', family: 4 as const }
      ]
    });
    await expect(
      assertHttpTargetUrlAllowed('https://public.example/health', 'full')
    ).resolves.toEqual(
      expect.objectContaining({
        addresses: [
          { address: '1.1.1.1', family: 4 },
          { address: '2606:4700:4700::1111', family: 6 }
        ],
        selected_address: '1.1.1.1',
        selected_family: 4
      })
    );
  });
});
