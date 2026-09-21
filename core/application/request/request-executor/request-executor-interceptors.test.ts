import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { UnauthorizedException } from '../../../http/exception/http-exception';
import { isRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import { SessionRuntimeState } from '../../session/session-runtime-state';
import type { SessionExpirationNotifierInterface } from '../../session/session-expiration-notifier';
import type { RequestInterceptorContext } from '../request-execution-chain';
import { RequestExecutor } from './request-executor.ts';

describe('RequestExecutor execution chains', () => {
  it('does not run callbacks or configure the singleton when a chain is abandoned', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const before = vi.fn();
    const after = vi.fn(<T>(value: T) => value);

    executor.request.use(before).response.use(after);

    expect(before).not.toHaveBeenCalled();
    await expect(executor.run(async () => 'plain')).resolves.toBe('plain');
    expect(before).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it('keeps separate interceptor snapshots when a configuration is branched', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const common = vi.fn();
    const left = vi.fn();
    const right = vi.fn();
    const base = executor.request.use(common);
    const first = base.request.use(left);
    const second = base.request.use(right);

    await first.run(async () => 'first');
    expect(left).toHaveBeenCalledOnce();
    expect(right).not.toHaveBeenCalled();

    await second.run(async () => 'second');
    await base.run(async () => 'base');

    expect(common).toHaveBeenCalledTimes(3);
    expect(left).toHaveBeenCalledOnce();
    expect(right).toHaveBeenCalledOnce();
  });

  it('isolates parallel chains and a plain run when they complete in reverse order', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const firstPreparation = deferred<void>();
    const firstStarted = deferred<void>();
    const secondResponse = deferred<string>();
    const secondStarted = deferred<void>();
    const events: string[] = [];

    const first = executor.request
      .use(async () => {
        events.push('first:prepare');
        firstStarted.resolve();
        await firstPreparation.promise;
      })
      .response.use((value) => {
        events.push('first:result');
        return value;
      })
      .run(async () => {
        events.push('first:operation');
        return 'first';
      });

    await firstStarted.promise;

    const second = executor.response
      .use((value) => {
        events.push('second:result');
        return value;
      })
      .run(async () => {
        events.push('second:operation');
        secondStarted.resolve();
        return secondResponse.promise;
      });

    await secondStarted.promise;
    await expect(executor.run(async () => 'plain')).resolves.toBe('plain');
    secondResponse.resolve('second');
    await expect(second).resolves.toBe('second');
    firstPreparation.resolve();
    await expect(first).resolves.toBe('first');

    expect(events).toEqual(['first:prepare', 'second:operation', 'second:result', 'first:operation', 'first:result']);
  });

  it('executes both callback stages in registration order and preserves result inference', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const events: string[] = [];
    const result = { id: 'profile' };
    const promise = executor.request
      .use(() => {
        events.push('before:1');
      })
      .request.use(async () => {
        events.push('before:2');
      })
      .response.use((value) => {
        events.push('after:1');
        return value;
      })
      .response.use(async (value) => {
        events.push('after:2');
        return value;
      })
      .run(async () => {
        events.push('operation');
        return result;
      });

    expectTypeOf(promise).toEqualTypeOf<Promise<{ id: string }>>();
    await expect(promise).resolves.toBe(result);
    expect(events).toEqual(['before:1', 'before:2', 'operation', 'after:1', 'after:2']);
  });

  it('recovers preparation at the next request rejection handler, not its paired handler', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const error = new Error('Preparation failed');
    const paired = vi.fn();
    const skipped = vi.fn();
    const recovered = vi.fn();
    const operation = vi.fn(async () => 'result');

    const result = executor.request
      .use(() => {
        throw error;
      }, paired)
      .request.use(skipped, recovered)
      .run(operation);

    await expect(result).resolves.toBe('result');
    expect(paired).not.toHaveBeenCalled();
    expect(skipped).not.toHaveBeenCalled();
    expect(recovered).toHaveBeenCalledWith(error, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(operation).toHaveBeenCalledOnce();
  });

  it('passes an unrecovered preparation error to response rejection handlers without running the operation', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const error = new Error('Preparation failed');
    const operation = vi.fn(async () => 'unused');
    const onRejected = vi.fn((cause: unknown): never => {
      throw cause;
    });

    await expect(
      executor.request
        .use(() => {
          throw error;
        })
        .response.use(undefined, onRejected)
        .run(operation),
    ).rejects.toBe(error);

    expect(operation).not.toHaveBeenCalled();
    expect(onRejected).toHaveBeenCalledOnce();
  });

  it('passes response callback failures to subsequent rejection handlers without replacing the cause', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const error = new Error('Response failed');
    const paired = vi.fn((cause: unknown): never => {
      throw cause;
    });
    const subsequent = vi.fn((cause: unknown): never => {
      throw cause;
    });

    await expect(
      executor.response
        .use(() => {
          throw error;
        }, paired)
        .response.use(undefined, subsequent)
        .run(async () => 'result'),
    ).rejects.toBe(error);

    expect(paired).not.toHaveBeenCalled();
    expect(subsequent).toHaveBeenCalledWith(error, expect.anything());
  });

  it('allows a recovered 401 to continue through response callbacks without expiring the session', async () => {
    const session = new SessionRuntimeState();
    const notifier = { notify: vi.fn() } as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const error = new UnauthorizedException({ title: 'Recoverable response' });
    const response = vi.fn(<T>(value: T) => value);
    session.setAuthenticated();

    // This fixture recovers a void operation; the public callback preserves the operation's T.
    await expect(
      executor.response
        .use(undefined, <T>(cause: unknown) => {
          if (cause !== error) throw cause;
          return undefined as T;
        })
        .response.use(response)
        .run(async (): Promise<void> => {
          throw error;
        }),
    ).resolves.toBeUndefined();

    expect(response).toHaveBeenCalledOnce();
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(session.phase).toBe('authenticated');
  });

  it('keeps an anonymous unrecovered 401 as the original rejection', async () => {
    const session = new SessionRuntimeState();
    session.setAnonymous();
    const executor = new RequestExecutor(session);
    const error = new UnauthorizedException({ title: 'Unauthorized' });

    await expect(
      executor.response
        .use(undefined, (cause): never => {
          throw cause;
        })
        .run(async () => {
          throw error;
        }),
    ).rejects.toBe(error);
  });

  it('shares protected-session recovery between chained and plain tasks', async () => {
    const session = new SessionRuntimeState();
    const notifyStarted = deferred<void>();
    const notification = deferred<void>();
    const notifier = {
      notify: vi.fn(() => {
        notifyStarted.resolve();
        return notification.promise;
      }),
    } as SessionExpirationNotifierInterface;
    const executor = new RequestExecutor(session, notifier);
    const releaseFirst = deferred<void>();
    const firstStarted = deferred<void>();
    const releaseSecond = deferred<void>();
    const secondStarted = deferred<void>();
    const terminated = vi.fn();
    const error = new UnauthorizedException({ title: 'Unauthorized' });
    session.setAuthenticated();

    const first = executor.response
      .use(undefined, (cause): never => {
        throw cause;
      })
      .run(async () => {
        firstStarted.resolve();
        await releaseFirst.promise;
        throw error;
      });
    const second = executor.run(async () => {
      secondStarted.resolve();
      await releaseSecond.promise;
      throw error;
    });
    void first.then(terminated, terminated);
    void second.then(terminated, terminated);
    await Promise.all([firstStarted.promise, secondStarted.promise]);

    releaseFirst.resolve();
    await notifyStarted.promise;
    releaseSecond.resolve();
    const blockedPreparation = vi.fn();
    const blockedOperation = vi.fn(async () => 'blocked');
    void executor.request.use(blockedPreparation).run(blockedOperation);

    notification.resolve();
    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));
    expect(notifier.notify).toHaveBeenCalledOnce();
    expect(terminated).not.toHaveBeenCalled();
    expect(blockedPreparation).not.toHaveBeenCalled();
    expect(blockedOperation).not.toHaveBeenCalled();
  });

  it('does not invoke preparation before a sequential task starts and preserves queue priority', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const release = deferred<void>();
    const events: string[] = [];
    const first = executor.run({ mode: 'sequential', queueKey: 'shared' }, () => release.promise);
    const options = { mode: 'sequential' as const, queueKey: 'shared', scope: 'snapshot', priority: 1 };
    const second = executor.request
      .use((context) => {
        expect(context.options.scope).toBe('snapshot');
        expect(context.options.priority).toBe(1);
        expect(Object.isFrozen(context.options)).toBe(true);
        events.push('second:prepare');
      })
      .run(options, async () => {
        events.push('second:operation');
      });
    options.scope = 'changed';
    options.priority = 10;
    const third = executor.run({ mode: 'sequential', queueKey: 'shared', priority: 2 }, async () => {
      events.push('third:operation');
    });

    expect(events).toEqual([]);
    release.resolve();
    await Promise.all([first, second, third]);
    expect(events).toEqual(['third:operation', 'second:prepare', 'second:operation']);
  });

  it('does not start cancelled preparation and shares cancelPrevious with plain tasks', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const release = deferred<void>();
    const first = executor.run({ mode: 'sequential', queueKey: 'shared' }, () => release.promise);
    const preparation = vi.fn();
    const operation = vi.fn(async () => 'cancelled');
    const cancelled = executor.request
      .use(preparation)
      .run({ mode: 'sequential', queueKey: 'shared', scope: 'replace' }, operation);
    const cancellation = expect(cancelled).rejects.toMatchObject({ reason: 'request-cancelled' });
    const replacement = executor.run({ scope: 'replace', cancelPrevious: true }, async () => 'replacement');

    await cancellation;
    await expect(replacement).resolves.toBe('replacement');
    release.resolve();
    await first;
    expect(preparation).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });

  it('prevents the operation and error recovery after cancellation during preparation', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const entered = deferred<void>();
    const release = deferred<void>();
    const operation = vi.fn(async () => 'late');
    const recovery = vi.fn((cause: unknown): never => {
      throw cause;
    });
    let context!: RequestInterceptorContext;
    const task = executor.request
      .use(async (value) => {
        context = value;
        entered.resolve();
        await release.promise;
      })
      .response.use(undefined, recovery)
      .run({ scope: 'cancel' }, operation);

    await entered.promise;
    executor.cancelScope('cancel');
    expect(context.signal.aborted).toBe(true);
    release.resolve();
    await expect(task).rejects.toSatisfy(isRuntimeInterruption);
    expect(operation).not.toHaveBeenCalled();
    expect(recovery).not.toHaveBeenCalled();
  });

  it('discards a late response callback result after cancellation', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const entered = deferred<void>();
    const release = deferred<void>();
    const next = vi.fn(<T>(value: T) => value);
    const task = executor.response
      .use(async (value) => {
        entered.resolve();
        await release.promise;
        return value;
      })
      .response.use(next)
      .run({ scope: 'cancel' }, async () => 'late');

    await entered.promise;
    executor.cancelScope('cancel');
    release.resolve();
    await expect(task).rejects.toSatisfy(isRuntimeInterruption);
    expect(next).not.toHaveBeenCalled();
  });

  it('cancels chained and plain tasks together through cancelAll', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const entered = deferred<void>();
    const release = deferred<void>();
    const signals: AbortSignal[] = [];
    const chained = executor.request
      .use(async ({ signal }) => {
        signals.push(signal);
        entered.resolve();
        await release.promise;
      })
      .run(async () => 'chained');
    const plain = executor.run(async ({ signal }) => {
      signals.push(signal);
      await release.promise;
      return 'plain';
    });
    const results = Promise.allSettled([chained, plain]);

    await entered.promise;
    executor.cancelAll();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    release.resolve();
    expect(await results).toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ reason: 'request-cancelled' }) }),
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ reason: 'request-cancelled' }) }),
    ]);
  });

  it('lets a nested plain operation execute without entering the outer interceptors', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const inner = vi.fn(async () => 'inner');
    const preparation = vi.fn(async () => {
      await executor.run(inner);
    });

    await expect(executor.request.use(preparation).run(async () => 'outer')).resolves.toBe('outer');
    expect(preparation).toHaveBeenCalledOnce();
    expect(inner).toHaveBeenCalledOnce();
  });

  it('gives parallel uses of the same saved configuration independent execution contexts', async () => {
    const executor = new RequestExecutor(new SessionRuntimeState());
    const contexts: RequestInterceptorContext[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    const chain = executor.request.use(async (context) => {
      contexts.push(context);
      if (contexts.length === 2) started.resolve();
      await release.promise;
    });

    const first = chain.run({ scope: 'first' }, async () => 'first');
    const second = chain.run({ scope: 'second' }, async () => 'second');
    const results = Promise.allSettled([first, second]);
    await started.promise;
    expect(contexts[0]).not.toBe(contexts[1]);
    expect(contexts[0]?.signal).not.toBe(contexts[1]?.signal);
    executor.cancelScope('first');
    release.resolve();

    expect(await results).toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ reason: 'request-cancelled' }) }),
      { status: 'fulfilled', value: 'second' },
    ]);
  });

  it('prevents a suspended chain from continuing after another task expires the session', async () => {
    const session = new SessionRuntimeState();
    const executor = new RequestExecutor(session);
    const entered = deferred<void>();
    const release = deferred<void>();
    const callbackFinished = deferred<void>();
    const operation = vi.fn(async () => 'stale');
    const settled = vi.fn();
    let signal!: AbortSignal;
    session.setAuthenticated();

    const task = executor.request
      .use(async (context) => {
        signal = context.signal;
        entered.resolve();
        await release.promise;
        callbackFinished.resolve();
      })
      .run(operation);
    void task.then(settled, settled);
    await entered.promise;
    void executor.run(async () => {
      throw new UnauthorizedException({ title: 'Expired' });
    });
    await vi.waitFor(() => expect(session.phase).toBe('anonymous'));
    expect(signal.aborted).toBe(true);
    release.resolve();
    await callbackFinished.promise;

    // Wait behind the cancelled chain's continuation without introducing a timer.
    await executor.response.use().run(async () => 'checkpoint');
    expect(operation).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
