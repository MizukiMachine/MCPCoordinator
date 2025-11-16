export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type StructuredLogContext = Record<string, any>;

export type StructuredLogSink = (
  level: LogLevel,
  message: string,
  context?: StructuredLogContext,
) => void;

export interface StructuredLogger {
  debug(message: string, context?: StructuredLogContext): void;
  info(message: string, context?: StructuredLogContext): void;
  warn(message: string, context?: StructuredLogContext): void;
  error(message: string, context?: StructuredLogContext): void;
}

export interface StructuredLoggerOptions {
  sink?: StructuredLogSink;
  component?: string;
  defaultContext?: StructuredLogContext;
}

function resolveConsoleMethod(level: LogLevel) {
  if (typeof console === 'undefined') {
    return () => {};
  }
  const method = (console as unknown as Record<LogLevel, unknown>)[level];
  if (typeof method === 'function') {
    return (method as (...args: unknown[]) => void).bind(console);
  }
  return console.log.bind(console);
}

const consoleSink: StructuredLogSink = (level, message, context) => {
  const target = resolveConsoleMethod(level);
  target('[structured-log]', { level, message, ...(context ?? {}) });
};

const noop: StructuredLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export const noopStructuredLogger: StructuredLogger = noop;

function mergeContext(
  defaults: StructuredLogContext | undefined,
  overrides: StructuredLogContext | undefined,
  component?: string,
): StructuredLogContext | undefined {
  if (!defaults && !overrides && !component) {
    return undefined;
  }
  return {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
    ...(component ? { component } : {}),
  };
}

export function createStructuredLogger(
  options: StructuredLoggerOptions = {},
): StructuredLogger {
  const sink = options.sink ?? consoleSink;
  const component = options.component;
  const defaultContext = options.defaultContext;

  const invoke = (level: LogLevel, message: string, context?: StructuredLogContext) => {
    sink(level, message, mergeContext(defaultContext, context, component));
  };

  return {
    debug: (message, context) => invoke('debug', message, context),
    info: (message, context) => invoke('info', message, context),
    warn: (message, context) => invoke('warn', message, context),
    error: (message, context) => invoke('error', message, context),
  };
}

export function createConsoleLogger(component?: string): StructuredLogger {
  return createStructuredLogger({
    component,
    sink: (level, message, context) => {
      const target = resolveConsoleMethod(level);
      const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(context ?? {}),
      };
      target('[structured-log]', payload);
    },
  });
}
