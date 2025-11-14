export type ServiceToken<T> = symbol & { __service?: T };

export interface ServiceManagerLogger {
  debug?(message: string, context?: Record<string, any>): void;
  info?(message: string, context?: Record<string, any>): void;
  warn?(message: string, context?: Record<string, any>): void;
  error?(message: string, context?: Record<string, any>): void;
}

export interface ServiceManagerOptions {
  logger?: ServiceManagerLogger;
}

export interface ServiceRegistrationOptions<T> {
  dispose?: (instance: T) => void | Promise<void>;
  eager?: boolean;
}

interface ServiceRegistration<T> {
  factory: () => T;
  options: ServiceRegistrationOptions<T>;
  instance?: T;
}

export class ServiceManager {
  private readonly registry = new Map<ServiceToken<any>, ServiceRegistration<any>>();
  private readonly logger?: ServiceManagerLogger;

  constructor(options: ServiceManagerOptions = {}) {
    this.logger = options.logger;
  }

  register<T>(
    token: ServiceToken<T>,
    factory: () => T,
    options: ServiceRegistrationOptions<T> = {},
  ): void {
    if (this.registry.has(token)) {
      throw new ServiceRegistrationError(
        `Service ${this.describeToken(token)} has already been registered`,
      );
    }

    const registration: ServiceRegistration<T> = {
      factory,
      options,
    };
    this.registry.set(token, registration);

    if (options.eager) {
      this.instantiate(token, registration);
    }
  }

  has(token: ServiceToken<any>): boolean {
    return this.registry.has(token);
  }

  get<T>(token: ServiceToken<T>): T {
    const registration = this.registry.get(token);
    if (!registration) {
      throw new ServiceNotRegisteredError(
        `Service ${this.describeToken(token)} has not been registered`,
      );
    }

    if (registration.instance) {
      return registration.instance;
    }

    return this.instantiate(token, registration);
  }

  async shutdownAll(): Promise<void> {
    const pending: Array<Promise<void>> = [];
    const errors: Error[] = [];

    for (const [token, registration] of this.registry.entries()) {
      const instance = registration.instance;
      if (!instance) {
        continue;
      }

      if (registration.options.dispose) {
        const disposeFn = registration.options.dispose;
        pending.push(
          Promise.resolve(disposeFn(instance)).catch((error) => {
            const normalized = error instanceof Error ? error : new Error(String(error));
            errors.push(normalized);
            this.logger?.error?.('Service dispose failed', {
              service: this.describeToken(token),
              error: normalized,
            });
          }),
        );
      }

      registration.instance = undefined;
    }

    await Promise.all(pending);

    if (errors.length > 0) {
      throw createServiceAggregateError(errors, 'One or more services failed to dispose');
    }
  }

  private instantiate<T>(
    token: ServiceToken<T>,
    registration: ServiceRegistration<T>,
  ): T {
    try {
      const instance = registration.factory();
      registration.instance = instance;
      this.logger?.debug?.('Service instantiated', {
        service: this.describeToken(token),
      });
      return instance;
    } catch (error) {
      this.logger?.error?.('Service instantiation failed', {
        service: this.describeToken(token),
        error,
      });
      throw new ServiceFactoryError(
        `Failed to instantiate service ${this.describeToken(token)}`,
        {
          cause: error,
        },
      );
    }
  }

  private describeToken(token: ServiceToken<any>): string {
    return token.description ?? token.toString();
  }
}

class ServiceDisposeError extends Error {
  public readonly errors: Error[];

  constructor(message: string, errors: Error[]) {
    super(message);
    this.name = 'ServiceDisposeError';
    this.errors = errors;
  }
}

function createServiceAggregateError(errors: Error[], message: string): Error {
  const AggregateErrorCtor = (globalThis as typeof globalThis & {
    AggregateError?: typeof AggregateError;
  }).AggregateError;

  if (typeof AggregateErrorCtor === 'function') {
    return new AggregateErrorCtor(errors, message);
  }

  return new ServiceDisposeError(message, errors);
}

export function createServiceToken<T>(name: string): ServiceToken<T> {
  return Symbol(name) as ServiceToken<T>;
}

export class ServiceRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceRegistrationError';
  }
}

export class ServiceNotRegisteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceNotRegisteredError';
  }
}

export class ServiceFactoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ServiceFactoryError';
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
  }
}
