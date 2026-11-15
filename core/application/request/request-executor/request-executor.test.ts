import { describe, expect, it, vi } from 'vitest';

import type { ApplicationReportDispatcherInterface } from '../../reporting/application-report';
import { UnauthorizedException } from '../../../http/exception/http-exception';
import {
  createRuntimeCompletionRevisionGuard,
  createRuntimeRevisionGuard,
  executeRuntimeOperation,
} from '../../../runtime/operation/runtime-operation';
import { isRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import type { SessionExpirationNotifierInterface } from '../../session/session-expiration-notifier';
import { SessionRuntimeState } from '../../session/session-runtime-state';
import { RequestExecutor } from './request-executor.ts';

describe('RequestExecutor', () => {
  it('cancels an uncooperative request and releases its sequential key before its late response', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const abort = new AbortController();
    const finish = createDeferred<string>();
    const signals: AbortSignal[] = [];
    const first = executor.run({ queueKey: 'shared', mode: 'sequential', signal: abort.signal }, ({ signal }) => {
      signals.push(signal);
      return finish.promise;
    });
    const failure = first.catch((error) => error);
    const secondFinish = createDeferred<string>();
    const next = vi.fn(() => secondFinish.promise);
    const second = executor.run({ queueKey: 'shared', mode: 'sequential' }, next);
    expect(next).not.toHaveBeenCalled();
    abort.abort();
    expect(isRuntimeInterruption(await failure)).toBe(true);
    expect(signals[0]!.aborted).toBe(true);
    const third = vi.fn(async () => 'third');
    const thirdResult = executor.run({ queueKey: 'shared', mode: 'sequential' }, third);
    finish.resolve('stale');
    await Promise.resolve();
    await Promise.resolve();
    expect(third).not.toHaveBeenCalled();
    secondFinish.resolve('next');
    expect(await second).toBe('next');
    expect(await thirdResult).toBe('third');
  });

  it('removes a cancelled queued request without cancelling an active request', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const finish = createDeferred<string>();
    const abort = new AbortController();
    const first = executor.run({ queueKey: 'shared', mode: 'sequential' }, () => finish.promise);
    const queued = vi.fn(async () => 'queued');
    const second = executor.run({ queueKey: 'shared', mode: 'sequential', signal: abort.signal }, queued);
    const failure = second.catch((error) => error);
    abort.abort();
    expect(isRuntimeInterruption(await failure)).toBe(true);
    finish.resolve('first');
    expect(await first).toBe('first');
    expect(queued).not.toHaveBeenCalled();
  });

  it('does not cancel existing work for a pre-aborted cancelPrevious caller', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const finish = createDeferred<string>();
    let runningSignal!: AbortSignal;
    const first = executor.run({ scope: 'same' }, ({ signal }) => {
      runningSignal = signal;
      return finish.promise;
    });
    const abort = new AbortController();
    abort.abort();
    await expect(
      executor.run({ scope: 'same', cancelPrevious: true, signal: abort.signal }, async () => 'unused'),
    ).rejects.toSatisfy(isRuntimeInterruption);
    expect(runningSignal.aborted).toBe(false);
    finish.resolve('first');
    expect(await first).toBe('first');
  });

  it('keeps cancellation terminal when an active operation resolves after abort', async () => {
    const session = new SessionRuntimeState();
    const operation = createDeferred<string>();
    const executor = new RequestExecutor(session);
    const resultPromise = executor.run({ scope: 'test' }, () => operation.promise);

    executor.cancelScope('test');
    operation.resolve('stale');

    const [result] = await Promise.allSettled([resultPromise]);

    expect(result?.status).toBe('rejected');

    if (result?.status === 'rejected') {
      expect(isRuntimeInterruption(result.reason)).toBe(true);
      expect(result.reason).toMatchObject({ reason: 'request-cancelled' });
    }
  });

  it('does not bind shared session recovery to the first request signal', async () => {
    const session = new SessionRuntimeState();
    const notification = createDeferred<void>();
    const recoverySignals: AbortSignal[] = [];
    const notifier = {
      notify: vi.fn(({ signal }) => {
        recoverySignals.push(signal);
        return notification.promise;
      }),
    } as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);

    session.setAuthenticated();

    const resultPromise = executor.run({ scope: 'first-owner' }, () =>
      Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })),
    );
    const settled = vi.fn();

    void resultPromise.then(settled, settled);

    await vi.waitFor(() => expect(notifier.notify).toHaveBeenCalledOnce());
    executor.cancelScope('first-owner');

    const activeRecoverySignal = recoverySignals[0];

    if (activeRecoverySignal === undefined) {
      throw new Error('Session recovery signal was not captured.');
    }

    expect(activeRecoverySignal.aborted).toBe(false);

    notification.resolve();
    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));
    expect(settled).not.toHaveBeenCalled();
  });

  it('coordinates concurrent authenticated 401 responses as one session recovery', async () => {
    const session = new SessionRuntimeState();
    const notification = createDeferred<void>();
    const notifier = { notify: vi.fn(() => notification.promise) } as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const error = new UnauthorizedException({ title: 'Unauthorized' });

    session.setAuthenticated();

    const first = executor.run(() => Promise.reject(error));
    const second = executor.run(() => Promise.reject(error));
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();

    void first.then(firstSettled, firstSettled);
    void second.then(secondSettled, secondSettled);

    await vi.waitFor(() => expect(notifier.notify).toHaveBeenCalledOnce());
    expect(session.phase).toBe('authenticated');

    notification.resolve();
    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));

    expect(firstSettled).not.toHaveBeenCalled();
    expect(secondSettled).not.toHaveBeenCalled();
  });

  it('contains an unknown-session 401 inside application session recovery', async () => {
    const session = new SessionRuntimeState();
    const notifier = { notify: vi.fn() } as unknown as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const settled = vi.fn();

    const result = executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));

    void result.then(settled, settled);

    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });

  it('does not expose a protected-session 401 to controller catch blocks', async () => {
    const session = new SessionRuntimeState();
    const notifier = { notify: vi.fn() } as unknown as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const caught = vi.fn();

    session.setAuthenticated();

    const result = await executeRuntimeOperation({
      guard: createRuntimeRevisionGuard(session),
      operation: async () => {
        try {
          await executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));
        } catch {
          caught();
        }
      },
      source: {
        operation: 'controller-action',
        owner: { kind: 'application' },
        participant: { kind: 'runtime' },
      },
    });

    expect(result).toMatchObject({ reason: 'guard-interrupted', type: 'interrupted' });
    expect(caught).not.toHaveBeenCalled();
  });

  it('actively completes an action guard when a protected session expires', async () => {
    const session = new SessionRuntimeState();
    const executor = new RequestExecutor(session);
    const caught = vi.fn();

    session.setAuthenticated();

    const result = await executeRuntimeOperation({
      guard: createRuntimeCompletionRevisionGuard(session),
      operation: async () => {
        try {
          await executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));
        } catch {
          caught();
        }
      },
      source: {
        operation: 'controller-action',
        owner: { kind: 'application' },
        participant: { kind: 'runtime' },
      },
    });

    expect(result).toMatchObject({ reason: 'guard-interrupted', type: 'interrupted' });
    expect(caught).not.toHaveBeenCalled();
  });

  it('interrupts an older protected action when logout wins the race with its 401', async () => {
    const session = new SessionRuntimeState();
    const executor = new RequestExecutor(session);
    const releaseResponse = createDeferred<void>();

    session.setAuthenticated();

    const resultPromise = executeRuntimeOperation({
      guard: createRuntimeCompletionRevisionGuard(session),
      operation: () =>
        executor.run(async () => {
          await releaseResponse.promise;
          throw new UnauthorizedException({ title: 'Unauthorized' });
        }),
      source: {
        operation: 'controller-action',
        owner: { kind: 'application' },
        participant: { kind: 'runtime' },
      },
    });

    session.setAnonymous();
    releaseResponse.resolve();

    await expect(resultPromise).resolves.toMatchObject({
      reason: 'guard-interrupted',
      type: 'interrupted',
    });
  });

  it('terminally contains other protected requests when the session expires', async () => {
    const session = new SessionRuntimeState();
    const notification = createDeferred<void>();
    const notifier = { notify: vi.fn(() => notification.promise) } as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const protectedRequestSettled = vi.fn();
    const protectedRequestSignals: AbortSignal[] = [];

    session.setAuthenticated();

    const protectedRequest = executor.run(({ signal }) => {
      protectedRequestSignals.push(signal);

      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    void protectedRequest.then(protectedRequestSettled, protectedRequestSettled);
    void executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));

    await vi.waitFor(() => expect(notifier.notify).toHaveBeenCalledOnce());

    const activeProtectedRequestSignal = protectedRequestSignals[0];

    if (activeProtectedRequestSignal === undefined) {
      throw new Error('Protected request signal was not captured.');
    }

    expect(activeProtectedRequestSignal.aborted).toBe(true);
    expect(session.phase).toBe('authenticated');
    expect(protectedRequestSettled).not.toHaveBeenCalled();

    notification.resolve();
    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));

    expect(protectedRequestSettled).not.toHaveBeenCalled();
  });

  it('does not start new protected requests while session recovery is active', async () => {
    const session = new SessionRuntimeState();
    const notification = createDeferred<void>();
    const notifier = { notify: vi.fn(() => notification.promise) } as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const lateOperation = vi.fn(() => Promise.resolve('late-result'));
    const lateRequestSettled = vi.fn();

    session.setAuthenticated();

    void executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));
    await vi.waitFor(() => expect(notifier.notify).toHaveBeenCalledOnce());

    const lateRequest = executor.run(lateOperation);

    void lateRequest.then(lateRequestSettled, lateRequestSettled);
    await Promise.resolve();

    expect(lateOperation).not.toHaveBeenCalled();
    expect(lateRequestSettled).not.toHaveBeenCalled();

    notification.resolve();
    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));
    expect(lateRequestSettled).not.toHaveBeenCalled();
  });

  it('releases a protected sequential queue when its aborted operation does not settle', async () => {
    const session = new SessionRuntimeState();
    const executor = new RequestExecutor(session);
    const protectedRequestSettled = vi.fn();

    session.setAuthenticated();

    const protectedRequest = executor.run(
      { mode: 'sequential', queueKey: 'terminal' },
      () => new Promise<never>(() => {}),
    );

    void protectedRequest.then(protectedRequestSettled, protectedRequestSettled);
    void executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));

    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));

    await expect(
      executor.run({ mode: 'sequential', queueKey: 'terminal' }, () => Promise.resolve('anonymous-request')),
    ).resolves.toBe('anonymous-request');
    expect(protectedRequestSettled).not.toHaveBeenCalled();
  });

  it('contains notifier failures and reports their application source', async () => {
    const session = new SessionRuntimeState();
    const notifierError = new Error('Notifier failed.');
    const notifier = {
      notify: vi.fn(() => Promise.reject(notifierError)),
    } as SessionExpirationNotifierInterface;
    const report = vi.fn();
    const reporter = { report } as unknown as ApplicationReportDispatcherInterface;
    const executor = new RequestExecutor(session, notifier, reporter);

    session.setAuthenticated();

    void executor.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));

    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'session-recovery.contained',
        failure: expect.objectContaining({
          cause: notifierError,
          source: expect.objectContaining({
            operation: 'notify-session-expiration',
            owner: { kind: 'application' },
            participant: { kind: 'session-expiration-notifier' },
          }),
        }),
      }),
    );
  });

  it('keeps anonymous-session 401 as an application rejection', async () => {
    const session = new SessionRuntimeState();
    const executor = new RequestExecutor(session);
    const error = new UnauthorizedException({ title: 'Invalid credentials' });

    session.setAnonymous();

    await expect(executor.run(() => Promise.reject(error))).rejects.toBe(error);
  });
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve: (value) => resolve(value as T) };
};
