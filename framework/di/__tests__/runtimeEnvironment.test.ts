/// <reference types="vitest" />
import { describe, expect, it } from 'vitest';

import { detectRuntimeEnvironment } from '../runtimeEnvironment';

describe('detectRuntimeEnvironment', () => {
  it('returns test when the env flags a test runtime', () => {
    expect(
      detectRuntimeEnvironment({ env: { NODE_ENV: 'test' }, hasWindow: true }),
    ).toBe('test');

    expect(
      detectRuntimeEnvironment({ env: { VITEST: 'true' }, hasWindow: false }),
    ).toBe('test');
  });

  it('returns api when running without a window', () => {
    expect(
      detectRuntimeEnvironment({ env: { NODE_ENV: 'production' }, hasWindow: false }),
    ).toBe('api');
  });

  it('returns web when a window object is present', () => {
    expect(
      detectRuntimeEnvironment({ env: { NODE_ENV: 'production' }, hasWindow: true }),
    ).toBe('web');
  });
});
