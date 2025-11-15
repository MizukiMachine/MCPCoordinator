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

const consoleSink: StructuredLogSink = (level, message, context) => {
  const target =
    typeof console !== 'undefined' && typeof (console as any)[level] === 'function'
      ? (console as any)[level]
      : console.log;
  target.call(console, '[structured-log]', { level, message, ...(context ?? {}) });
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
      const target =
        typeof console !== 'undefined' && typeof (console as any)[level] === 'function'
          ? (console as any)[level]
          : console.log;
      const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(context ?? {}),
      };
      target.call(console, '[structured-log]', payload);
    },
  });
}
