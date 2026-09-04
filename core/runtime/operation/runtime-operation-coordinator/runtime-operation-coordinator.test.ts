import { describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { RuntimeOperationCoordinator } from './runtime-operation-coordinator.ts';

describe('RuntimeOperationCoordinator', () => {
  it('collapses every invalidation of one operation into one refresh wave', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const refresh = vi.fn(async () => {});

    coordinator.attachRefresh(refresh);

    await coordinator.run(async () => {
      session.setAnonymous();
      coordinator.invalidate();
      session.setAuthenticated();
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('resolves an asynchronous operation only after its refresh wave completes', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const refresh = createDeferred<void>();
    const order: string[] = [];

    coordinator.attachRefresh(() => refresh.promise);

    const operation = coordinator
      .run(async () => {
        session.setAuthenticated();
        order.push('operation');
      })
      .then(() => {
        order.push('resolved');
      });

    await Promise.resolve();
    expect(order).toEqual(['operation']);

    refresh.resolve();
    await operation;

    expect(order).toEqual(['operation', 'resolved']);
  });

  it('serializes an invalidation raised while a refresh wave is in progress', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const firstRefresh = createDeferred<void>();
    const refresh = vi.fn().mockReturnValueOnce(firstRefresh.promise).mockResolvedValue(undefined);

    coordinator.attachRefresh(refresh);

    session.setAnonymous();
    await waitForMicrotasks();

    expect(refresh).toHaveBeenCalledOnce();

    session.setAuthenticated();
    firstRefresh.resolve();

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });

  it('preserves a synchronous operation result and batches refresh after it exits', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const refresh = vi.fn();

    coordinator.attachRefresh(refresh);

    const result = coordinator.run(() => {
      session.setAuthenticated();
      expect(refresh).not.toHaveBeenCalled();
      return 'ready';
    });

    expect(result).toBe('ready');
    await waitForMicrotasks();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not postpone a session refresh until an unrelated long operation completes', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const operation = createDeferred<void>();
    const refresh = vi.fn();

    coordinator.attachRefresh(refresh);
    const pendingOperation = coordinator.run(() => operation.promise);

    session.setAuthenticated();

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());

    operation.resolve();
    await pendingOperation;
  });
});

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value?: TValue) => void;
}

const createDeferred = <TValue>(): Deferred<TValue> => {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((innerResolve) => {
    resolve = innerResolve;
  });

  return {
    promise,
    resolve: (value) => resolve(value as TValue),
  };
};

const waitForMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
