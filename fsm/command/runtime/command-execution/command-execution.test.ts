import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandExecution } from './command-execution.ts';

class FirstCommand {}
class SecondCommand {}

const fixture = () => {
  const execution = new CommandExecution();
  const request = Promise.withResolvers<{ signal: AbortSignal; id: string }>();
  const send = vi.fn(async (signal: AbortSignal, id: string) => {
    request.resolve({ signal, id });
  });

  return { execution, send, request: request.promise };
};

afterEach(() => vi.useRealTimers());

describe('FSM command confirmation', () => {
  it.each(['first', 'catalog'])('completes on the next applied %s snapshot without a command id', async (screen) => {
    const { execution, send, request } = fixture();
    let result = 'pending';
    const operation = execution.run({ screen: 'first' }, FirstCommand, send).then(
      () => {
        result = 'completed';
      },
      () => {
        result = 'failed';
      },
    );

    try {
      await request;
      execution.confirm({ screen });
      await Promise.resolve();
      expect(result).toBe('completed');
    } finally {
      execution.dispose();
      await operation;
    }
  });

  it('does not share pending commands or confirmations between applications', async () => {
    const first = fixture();
    const second = fixture();
    const firstOperation = first.execution.run({}, FirstCommand, first.send);
    const secondOperation = second.execution.run({}, SecondCommand, second.send);
    const firstRequest = await first.request;
    const secondRequest = await second.request;
    const secondCompleted = vi.fn();
    void secondOperation.then(secondCompleted);

    first.execution.confirm({ id: firstRequest.id });
    await firstOperation;
    await Promise.resolve();

    expect(secondCompleted).not.toHaveBeenCalled();

    second.execution.confirm({ id: secondRequest.id });
    await secondOperation;
    first.execution.dispose();
    second.execution.dispose();
  });

  it('stays pending after HTTP success and ignores republication of the current snapshot', async () => {
    const { execution, send, request } = fixture();
    const completed = vi.fn();
    const snapshot = {};
    const operation = execution.run(snapshot, FirstCommand, send);
    void operation.then(completed);
    await request;

    await Promise.resolve();
    execution.confirm(snapshot);
    await Promise.resolve();

    expect(completed).not.toHaveBeenCalled();

    execution.confirm({ id: 'not-the-command-id' });
    await operation;

    expect(completed).toHaveBeenCalledOnce();
    execution.dispose();
  });

  it('accepts the next snapshot even before HTTP finishes', async () => {
    const { execution } = fixture();
    const response = Promise.withResolvers<void>();
    const sent = Promise.withResolvers<string>();
    const operation = execution.run({}, FirstCommand, async (_signal, id) => {
      sent.resolve(id);
      await response.promise;
    });

    execution.confirm({ id: await sent.promise });
    await operation;
    response.reject(new Error('Late transport error'));

    await Promise.resolve();
    execution.dispose();
  });

  it('cleans up a still-open HTTP request on disposal after snapshot confirmation', async () => {
    const { execution } = fixture();
    const sent = Promise.withResolvers<{ id: string; signal: AbortSignal }>();
    const operation = execution.run({}, FirstCommand, (signal, id) => {
      sent.resolve({ signal, id });

      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const request = await sent.promise;

    execution.confirm({ id: request.id });
    await operation;

    expect(request.signal.aborted).toBe(false);

    execution.dispose();

    expect(request.signal.aborted).toBe(true);
  });

  it('registers confirmation before invoking a synchronously publishing transport', async () => {
    const { execution } = fixture();

    await execution.run({}, FirstCommand, async (_signal, id) => {
      execution.confirm({ id });
    });

    execution.dispose();
  });

  it('coalesces the same command but rejects a different command without sending it', async () => {
    const { execution, send, request } = fixture();
    const snapshot = {};
    const operation = execution.run(snapshot, FirstCommand, send);
    const other = vi.fn();

    expect(execution.run(snapshot, FirstCommand, send)).toBe(operation);
    await expect(execution.run(snapshot, SecondCommand, other)).rejects.toThrow('ожидает snapshot');
    expect(other).not.toHaveBeenCalled();

    execution.confirm({ id: (await request).id });
    await operation;
    expect(send).toHaveBeenCalledOnce();
    execution.dispose();
  });

  it('releases the execution gate after a failed send', async () => {
    const { execution, send, request } = fixture();
    const error = new Error('Network failed');

    await expect(
      execution.run({}, FirstCommand, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    const next = execution.run({}, SecondCommand, send);
    execution.confirm({ id: (await request).id });
    await next;
    execution.dispose();
  });

  it('does not let a late error from a confirmed command fail the next command', async () => {
    const { execution, send, request } = fixture();
    const response = Promise.withResolvers<void>();
    const sent = Promise.withResolvers<string>();
    const first = execution.run({}, FirstCommand, async (_signal, id) => {
      sent.resolve(id);
      await response.promise;
    });

    execution.confirm({ id: await sent.promise });
    await first;

    const completed = vi.fn();
    const next = execution.run({}, SecondCommand, send);
    void next.then(completed);
    const { id } = await request;
    response.reject(new Error('Old request failure'));

    await Promise.resolve();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();

    execution.confirm({ id });
    await next;
    execution.dispose();
  });

  it('fails missing confirmation without treating HTTP success as completion or retrying', async () => {
    vi.useFakeTimers();
    const { execution, send, request } = fixture();
    const operation = execution.run({}, FirstCommand, send);
    const rejected = expect(operation).rejects.toThrow('Не получен подтверждающий snapshot');
    const { signal } = await request;

    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;

    expect(signal.aborted).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    execution.dispose();
  });

  it('rejects pending execution on application disposal and clears its timer', async () => {
    vi.useFakeTimers();
    const { execution, send, request } = fixture();
    const operation = execution.run({}, FirstCommand, send);
    const rejected = expect(operation).rejects.toThrow('освобождено');
    const { signal, id } = await request;

    execution.dispose();
    execution.confirm({ id });

    await rejected;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await expect(execution.run({}, FirstCommand, send)).rejects.toThrow('освобождено');
  });
});
