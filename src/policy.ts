import {
  getRuntimeProfile,
  isRemoteSafeProfile,
  isTruthyEnv,
  type RuntimeProfile
} from './config.js';

export type RuntimeTransport = 'stdio' | 'http';

export interface RuntimePolicy {
  allowStdio: boolean;
  profile: RuntimeProfile;
  transport: RuntimeTransport;
}

export interface RuntimePolicyOptions {
  allowStdio?: boolean | undefined;
  profile?: RuntimeProfile | undefined;
  transport?: RuntimeTransport | undefined;
}

export const STDIO_DISABLED_MESSAGE = 'stdio transport is disabled for this runtime profile';

export function createRuntimePolicy(options: RuntimePolicyOptions = {}): RuntimePolicy {
  const profile = options.profile ?? getRuntimeProfile();
  const transport = options.transport ?? 'stdio';
  const requestedAllowStdio =
    options.allowStdio ??
    (transport === 'stdio' || isTruthyEnv(process.env.HEALTH_MONITOR_ALLOW_STDIO));

  return {
    profile,
    transport,
    allowStdio: isRemoteSafeProfile(profile) ? false : requestedAllowStdio
  };
}
