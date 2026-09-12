import { describe, expect, it, vi } from 'vitest';

import { createRuntimeFailure } from '../../failure/runtime-failure';

import {
  createRuntimeException,
  getRuntimeExceptionRecoverySnapshot,
  subscribeRuntimeExceptionRecovery,
} from './runtime-exception.ts';

describe('RuntimeException', () => {
  it('preserves Error diagnostics and boundary metadata', () => {
    const cause = new Error('Module loader failed.');
    const failure = createRuntimeFailure(cause, {
      operation: 'loader',
      owner: { kind: 'application' },
      participant: { kind: 'runtime' },
    });
    const retry = vi.fn(async () => undefined);
    const exception = createRuntimeException(failure, {
      disposition: 'application.failed',
      owner: { kind: 'application' },
      phase: 'failed',
      recovery: { retry },
    });
    expect(exception.recovery.retry?.inProcess).toBe(false);

    expect(exception).toMatchObject({
      boundary: {
        disposition: 'application.failed',
        owner: { kind: 'application' },
        phase: 'failed',
      },
      cause,
      createdAt: failure.createdAt,
      error: cause,
      id: failure.id,
      origin: {
        owner: failure.source.owner,
        participant: failure.source.participant,
        phase: failure.source.operation,
      },
      recovery: { retry: expect.any(Function) },
    });
    expect(exception.trace).toEqual([
      expect.objectContaining({
        disposition: 'application.failed',
        owner: { kind: 'application' },
      }),
    ]);
  });

  it('owns recovery processing independently of the underlying operation source', async () => {
    let completeOperation: (() => void) | undefined;
    const operation = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeOperation = resolve;
        }),
    );
    const back = vi.fn(async () => undefined);
    const exception = createRuntimeException(
      createRuntimeFailure(new Error('Module loader failed.'), {
        operation: 'loader',
        owner: { kind: 'module', token: class ModuleToken {} },
        participant: { kind: 'controller', token: class ControllerToken {} },
      }),
      {
        disposition: 'module.failed',
        owner: { kind: 'module', token: class ModuleToken {} },
        phase: 'failed',
        recovery: { back, retry: operation },
      },
    );
    const retry = exception.recovery.retry;

    expect(retry).toBeDefined();
    if (!retry) return;

    const listener = vi.fn();
    const unsubscribe = subscribeRuntimeExceptionRecovery(exception.recovery, listener);
    const first = retry();
    const second = retry();

    expect(first).toBe(second);
    expect(retry.inProcess).toBe(true);
    expect(exception.recovery.back?.inProcess).toBe(false);
    expect(getRuntimeExceptionRecoverySnapshot(exception.recovery)).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    await Promise.resolve();

    expect(operation).toHaveBeenCalledTimes(1);
    completeOperation?.();
    await first;

    expect(retry.inProcess).toBe(false);
    expect(getRuntimeExceptionRecoverySnapshot(exception.recovery)).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('ends recovery processing when the underlying operation fails', async () => {
    const operationError = new Error('Retry failed.');
    const exception = createRuntimeException(
      createRuntimeFailure(new Error('Widget loader failed.'), {
        operation: 'loader',
        owner: { instanceId: 'widget:1', kind: 'widget', token: class WidgetToken {} },
        participant: { kind: 'runtime' },
      }),
      {
        disposition: 'widget.failed',
        owner: { instanceId: 'widget:1', kind: 'widget', token: class WidgetToken {} },
        phase: 'failed',
        recovery: { retry: async () => Promise.reject(operationError) },
      },
    );
    const retry = exception.recovery.retry;

    expect(retry).toBeDefined();
    if (!retry) return;

    await expect(retry()).rejects.toBe(operationError);
    expect(retry.inProcess).toBe(false);
  });

  it('normalizes a non-Error throwable without losing its original value', () => {
    const failure = createRuntimeFailure('connection lost', {
      operation: 'initialize',
      owner: { kind: 'application' },
      participant: { kind: 'runtime' },
    });
    const exception = createRuntimeException(failure, {
      disposition: 'application.activation-failed',
      owner: { kind: 'application' },
      phase: 'failed',
    });

    expect(exception).toMatchObject({
      cause: 'connection lost',
      error: {
        cause: 'connection lost',
        message: 'connection lost',
        name: 'Exception',
      },
    });
    expect(exception.error).toBeInstanceOf(Error);
    expect(exception.error.stack).toEqual(expect.any(String));
  });
});
