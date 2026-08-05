import { describe, expect, it, vi } from 'vitest';

import type { RuntimeErrorReport } from '../../../application/reporting/runtime-error-report';
import { RuntimeErrorReporterInterface } from '../../../application/reporting/runtime-error-reporter';

import { RuntimeErrors } from './runtime-errors.ts';

describe('RuntimeErrors', () => {
  it('notifies global subscribers for every emitted error', async () => {
    const errors = new RuntimeErrors();
    const handler = vi.fn();
    const error = new Error('Operation failed.');

    errors.subscribe(handler);

    await errors.emit(error);

    expect(handler).toHaveBeenCalledWith(error);
  });

  it('notifies class subscribers only for matching error class', async () => {
    const errors = new RuntimeErrors();
    const unauthorizedHandler = vi.fn();
    const genericHandler = vi.fn();
    const unauthorized = new UnauthorizedException();

    errors.on(UnauthorizedException, unauthorizedHandler);
    errors.on(ValidationException, genericHandler);

    await errors.emit(unauthorized);

    expect(unauthorizedHandler).toHaveBeenCalledWith(unauthorized);
    expect(genericHandler).not.toHaveBeenCalled();
  });

  it('removes subscribers with returned unsubscribe callbacks', async () => {
    const errors = new RuntimeErrors();
    const handler = vi.fn();
    const unsubscribe = errors.on(UnauthorizedException, handler);

    unsubscribe();
    await errors.emit(new UnauthorizedException());

    expect(handler).not.toHaveBeenCalled();
  });

  it('waits for async handlers before resolving emit', async () => {
    const errors = new RuntimeErrors();
    const events: string[] = [];
    let releaseHandler: () => void = () => {};
    const handlerPromise = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });

    errors.subscribe(async () => {
      await handlerPromise;
      events.push('handler');
    });

    const emitPromise = errors.emit(new Error('Operation failed.')).then(() => {
      events.push('emit');
    });

    await Promise.resolve();
    expect(events).toEqual([]);

    releaseHandler();
    await emitPromise;

    expect(events).toEqual(['handler', 'emit']);
  });

  it('reports handler errors without rejecting emit', async () => {
    const handlerError = new Error('Runtime error handler failed.');
    const reporter = new TestRuntimeErrorReporter();
    const errors = new RuntimeErrors(reporter);

    errors.subscribe(() => {
      throw handlerError;
    });

    await expect(errors.emit(new Error('Operation failed.'))).resolves.toBeUndefined();

    expect(reporter.reportMock).toHaveBeenCalledWith({
      code: 'application.runtime_error_handler.failed',
      error: handlerError,
    });
  });

  it('rejects non-error class subscriptions', () => {
    const errors = new RuntimeErrors();

    expect(() => {
      errors.on(PlainClass as never, () => {});
    }).toThrow('Runtime error subscription expects an error class constructor.');
  });
});

class UnauthorizedException extends Error {}

class ValidationException extends Error {}

class PlainClass {}

class TestRuntimeErrorReporter extends RuntimeErrorReporterInterface {
  readonly reportMock = vi.fn();

  report(report: RuntimeErrorReport): void {
    this.reportMock(report);
  }
}
