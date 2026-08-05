import { RuntimeErrorReporterInterface } from '../../../application/reporting/runtime-error-reporter';
import { Inject, Injectable, Optional } from '../../../di/injection/decorators';

import {
  RuntimeErrorsInterface,
  type RuntimeErrorConstructor,
  type RuntimeErrorHandler,
} from './runtime-errors.interface.ts';

interface RuntimeErrorSubscription {
  readonly errorType: RuntimeErrorConstructor;
  readonly handler: RuntimeErrorHandler<Error>;
}

@Injectable()
export class RuntimeErrors extends RuntimeErrorsInterface {
  private readonly listeners = new Set<RuntimeErrorHandler>();
  private readonly subscriptions = new Set<RuntimeErrorSubscription>();

  constructor(
    @Inject(RuntimeErrorReporterInterface)
    @Optional()
    private readonly reporter?: RuntimeErrorReporterInterface,
  ) {
    super();
  }

  async emit(error: unknown): Promise<void> {
    const calls: Promise<void>[] = [];

    for (const listener of this.listeners) {
      calls.push(this.callHandler(listener, error));
    }

    for (const subscription of this.subscriptions) {
      if (error instanceof subscription.errorType) {
        calls.push(this.callHandler(subscription.handler as RuntimeErrorHandler, error));
      }
    }

    await Promise.all(calls);
  }

  on<TError extends Error>(
    errorType: RuntimeErrorConstructor<TError>,
    handler: RuntimeErrorHandler<TError>,
  ): () => void {
    assertRuntimeErrorConstructor(errorType);

    const subscription: RuntimeErrorSubscription = {
      errorType,
      handler: (error) => handler(error as TError),
    };

    this.subscriptions.add(subscription);

    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  subscribe(handler: RuntimeErrorHandler): () => void {
    this.listeners.add(handler);

    return () => {
      this.listeners.delete(handler);
    };
  }

  private async callHandler(handler: RuntimeErrorHandler, error: unknown): Promise<void> {
    try {
      await handler(error);
    } catch (handlerError) {
      await this.reportHandlerError(handlerError);
    }
  }

  private async reportHandlerError(error: unknown): Promise<void> {
    if (!this.reporter) {
      fallbackReportHandlerError(error);
      return;
    }

    try {
      await this.reporter.report({
        code: 'application.runtime_error_handler.failed',
        error,
      });
    } catch {
      fallbackReportHandlerError(error);
    }
  }
}

const assertRuntimeErrorConstructor = <TError extends Error>(errorType: RuntimeErrorConstructor<TError>): void => {
  if (isRuntimeErrorConstructor(errorType)) {
    return;
  }

  throw new Error('Runtime error subscription expects an error class constructor.');
};

const isRuntimeErrorConstructor = (value: unknown): boolean => {
  if (value === Error) {
    return true;
  }

  if (!value || typeof value !== 'function') {
    return false;
  }

  return value.prototype instanceof Error;
};

const fallbackReportHandlerError = (error: unknown): void => {
  globalThis.console.error({
    code: 'application.runtime_error_handler.failed',
    error,
    phase: 'application.runtime_error',
    severity: 'error',
    source: 'application.runtime_error',
  });
};
