/// <reference types="vitest" />
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceManager, createServiceToken } from '../ServiceManager';

interface SampleService {
  id: string;
}

const sampleToken = createServiceToken<SampleService>('sample.service');

describe('ServiceManager', () => {
  let manager: ServiceManager;

  beforeEach(() => {
    manager = new ServiceManager();
  });

  it('creates a service via the registered factory exactly once', () => {
    const value: SampleService = { id: 'demo' };
    const factory = vi.fn(() => value);

    manager.register(sampleToken, factory);

    const first = manager.get(sampleToken);
    const second = manager.get(sampleToken);

    expect(first).toBe(value);
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('throws a helpful error when the service has not been registered', () => {
    expect(() => manager.get(sampleToken)).toThrowError(
      /Service sample\.service has not been registered/,
    );
  });

  it('runs registered disposer callbacks during shutdown', async () => {
    const dispose = vi.fn();
    const value: SampleService = { id: 'to-dispose' };
    manager.register(sampleToken, () => value, { dispose });

    manager.get(sampleToken);

    await manager.shutdownAll();

    expect(dispose).toHaveBeenCalledWith(value);
  });

  it('prevents duplicate registrations for the same token', () => {
    manager.register(sampleToken, () => ({ id: 'first' }));

    expect(() =>
      manager.register(sampleToken, () => ({ id: 'second' })),
    ).toThrowError(/Service sample\.service has already been registered/);
  });
});
