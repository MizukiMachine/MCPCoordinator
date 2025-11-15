export type MetricTags = Record<string, string>;

export interface MetricEmitter {
  increment(name: string, value?: number, tags?: MetricTags): void;
  observe(name: string, value: number, tags?: MetricTags): void;
}

const noop: MetricEmitter = {
  increment() {},
  observe() {},
};

export const createNoopMetricEmitter = (): MetricEmitter => noop;

function logMetric(
  namespace: string | undefined,
  type: 'counter' | 'histogram',
  name: string,
  value: number,
  tags?: MetricTags,
) {
  if (typeof console === 'undefined') return;
  const payload = {
    namespace,
    type,
    name,
    value,
    tags: tags ?? {},
    timestamp: new Date().toISOString(),
  };
  console.info('[metric]', payload);
}

export function createConsoleMetricEmitter(
  namespace?: string,
): MetricEmitter {
  return {
    increment: (name, value = 1, tags) =>
      logMetric(namespace, 'counter', name, value, tags),
    observe: (name, value, tags) =>
      logMetric(namespace, 'histogram', name, value, tags),
  };
}
