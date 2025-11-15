export type RuntimeEnvironment = 'web' | 'api' | 'test';

export interface EnvironmentDetectorOptions {
  override?: RuntimeEnvironment;
  env?: Record<string, string | undefined>;
  hasWindow?: boolean;
}

export function detectRuntimeEnvironment(
  options: EnvironmentDetectorOptions = {},
): RuntimeEnvironment {
  if (options.override) {
    return options.override;
  }

  const env =
    options.env ?? (typeof process !== 'undefined' ? process.env : undefined) ?? {};
  const hasWindow =
    typeof options.hasWindow === 'boolean'
      ? options.hasWindow
      : typeof window !== 'undefined';

  const isTestRuntime =
    env.VITEST === 'true' || env.NODE_ENV === 'test' || env.TEST === 'true';

  if (isTestRuntime) {
    return 'test';
  }

  return hasWindow ? 'web' : 'api';
}
