import { describe, expect, it, vi } from 'vitest';

import { createControllerLoaderData } from '../../../controller/data/controller-loader-data';
import {
  LoaderTransactionService,
  commitLoaderData,
  discardLoaderData,
} from '../../../controller/runtime/loader-transaction';
import { isRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import { Collector } from './collector.ts';
import type { Collection } from './collector.interface.ts';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};

const request = (items: number[]) => vi.fn(async (collection: Collection<number>) => collection.append(items));

const load = (
  execution: LoaderTransactionService,
  execute: () => Promise<unknown>,
  signal = new AbortController().signal,
) => execution.run(signal, async () => createControllerLoaderData([{ controller: 'list', value: await execute() }]));

describe('Collector', () => {
  it('returns accumulated arrays while preserving previous snapshots', async () => {
    const collector = new Collector<number>();
    const first = await collector.execute(request([1, 2]));
    const second = await collector.execute(request([3]));
    expect(Array.isArray(second)).toBe(true);
    expect(first).toEqual([1, 2]);
    expect(second).toEqual([1, 2, 3]);
    expect(second).not.toBe(first);
  });

  it('preserves order and duplicates without inferring domain uniqueness', async () => {
    const collector = new Collector<{ id: string }>();
    await collector.execute(async (collection) => collection.append([{ id: 'same' }]));
    expect(await collector.execute(async (collection) => collection.append([{ id: 'same' }]))).toEqual([
      { id: 'same' },
      { id: 'same' },
    ]);
  });

  it('supports an empty response without interpreting it as the end of requests', async () => {
    const collector = new Collector<number>();
    expect(await collector.execute(request([]))).toEqual([]);
    expect(await collector.execute(request([1]))).toEqual([1]);
    expect(await collector.execute(request([]))).toEqual([1]);
    expect(await collector.execute(request([2]))).toEqual([1, 2]);
  });

  it('supports more than one append within a request', async () => {
    const collector = new Collector<number>();
    const result = await collector.execute(async (collection) => {
      collection.append([1]);
      return collection.append([2]);
    });
    expect(result).toEqual([1, 2]);
  });

  it('rolls back all appended elements if the request fails', async () => {
    const collector = new Collector<number>();
    const previous = await collector.execute(request([1]));
    const failure = new Error('failed');
    await expect(
      collector.execute(async (collection) => {
        collection.append([99]);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(previous).toEqual([1]);
    expect(await collector.execute(request([2]))).toEqual([1, 2]);
  });

  it('keeps reset pending through failure and replaces only on success', async () => {
    const collector = new Collector<number>();
    const previous = await collector.execute(request([1, 2]));
    collector.reset();
    await expect(
      collector.execute(async (collection) => {
        collection.append([99]);
        throw new Error('new request failed');
      }),
    ).rejects.toThrow('new request failed');
    expect(previous).toEqual([1, 2]);
    expect(await collector.execute(request([3]))).toEqual([3]);
    expect(await collector.execute(request([4]))).toEqual([3, 4]);
  });

  it('shares one in-flight request for simultaneous calls', async () => {
    const collector = new Collector<number>();
    const pending = deferred<void>();
    const execute = vi.fn(async (collection: Collection<number>) => {
      await pending.promise;
      return collection.append([1]);
    });
    const first = collector.execute(execute);
    const second = collector.execute(execute);
    expect(first).toBe(second);
    pending.resolve();
    expect(await first).toEqual([1]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('starts a new request after reset without accepting an older response', async () => {
    const collector = new Collector<number>();
    const pending = deferred<void>();
    const previous = collector.execute(async (collection) => {
      await pending.promise;
      return collection.append([99]);
    });
    const rejected = previous.catch((error) => error);
    await Promise.resolve();
    collector.reset();
    expect(await collector.execute(request([1]))).toEqual([1]);
    pending.resolve();
    expect(isRuntimeInterruption(await rejected)).toBe(true);
    expect(await collector.execute(request([2]))).toEqual([1, 2]);
  });

  it('rejects work invalidated by reset before the callback has started', async () => {
    const collector = new Collector<number>();
    const execute = request([99]);
    const old = collector.execute(execute).catch((error) => error);
    collector.reset();
    expect(isRuntimeInterruption(await old)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(await collector.execute(request([1]))).toEqual([1]);
  });

  it('does not retain the exposed array as its internal accumulation', async () => {
    const collector = new Collector<number>();
    const first = await collector.execute(request([1]));
    first.push(99);
    expect(await collector.execute(request([2]))).toEqual([1, 2]);
  });

  it('does not share data between independent collectors', async () => {
    const first = new Collector<number>();
    const second = new Collector<number>();
    await first.execute(request([1]));
    expect(await second.execute(request([2]))).toEqual([2]);
    expect(await first.execute(request([3]))).toEqual([1, 3]);
  });

  it('closes the collection context after the callback has finished', async () => {
    const collector = new Collector<number>();
    let saved!: Collection<number>;
    await collector.execute(async (collection) => {
      saved = collection;
      return collection.append([1]);
    });
    expect(() => saved.append([99])).toThrow();
    expect(await collector.execute(request([2]))).toEqual([1, 2]);
  });

  it('uses consumer-managed state for a cursor contract', async () => {
    const service = {
      getAll: vi
        .fn()
        .mockResolvedValueOnce({ items: [1], nextCursor: 'opaque' })
        .mockResolvedValueOnce({ items: [2], nextCursor: null }),
    };
    const collector = new Collector<number, { after: string | null }>();
    const loader = () =>
      collector.execute(async (collection, state) => {
        const after = state.get('after');
        if (after === null) return collection.append([]);
        const response = await service.getAll({ after });
        state.set('after', response.nextCursor);
        return collection.append(response.items);
      });
    expect(await loader()).toEqual([1]);
    expect(await loader()).toEqual([1, 2]);
    expect(await loader()).toEqual([1, 2]);
    expect(service.getAll.mock.calls).toEqual([[{ after: undefined }], [{ after: 'opaque' }]]);
  });

  it('uses the same collector for nested rows and offset metadata', async () => {
    const service = {
      search: vi
        .fn()
        .mockResolvedValueOnce({ result: { rows: ['one'] }, meta: { paging: { offset: 0, more: true } } })
        .mockResolvedValueOnce({ result: { rows: ['two'] }, meta: { paging: { offset: 1, more: false } } }),
    };
    const collector = new Collector<string, { skip: number; finished: boolean }>();
    const loader = () =>
      collector.execute(async (collection, state) => {
        if (state.get('finished')) return collection.append([]);
        const response = await service.search({ offset: state.get('skip') ?? 0 });
        state.set('skip', response.meta.paging.offset + response.result.rows.length);
        state.set('finished', !response.meta.paging.more);
        return collection.append(response.result.rows);
      });
    expect(await loader()).toEqual(['one']);
    expect(await loader()).toEqual(['one', 'two']);
    expect(await loader()).toEqual(['one', 'two']);
    expect(service.search.mock.calls).toEqual([[{ offset: 0 }], [{ offset: 1 }]]);
  });

  it('rolls back state together with appended items', async () => {
    const collector = new Collector<number, { position: number }>();
    await collector.execute(async (collection, state) => {
      state.set('position', 10);
      return collection.append([1]);
    });
    await expect(
      collector.execute(async (collection, state) => {
        state.set('position', 20);
        collection.append([99]);
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(collector.state.get('position')).toBe(10);
    expect(
      await collector.execute(async (collection, state) => {
        expect(state.get('position')).toBe(10);
        state.set('position', 20);
        return collection.append([2]);
      }),
    ).toEqual([1, 2]);
  });

  it('resets working state while retaining confirmed state until success', async () => {
    const collector = new Collector<number, { position: number; complete: boolean }>();
    await collector.execute(async (collection, state) => {
      state.set('position', 0);
      state.set('complete', false);
      return collection.append([1]);
    });
    collector.reset();
    expect(collector.state.get('position')).toBe(0);
    expect(collector.state.get('complete')).toBe(false);
    expect(
      await collector.execute(async (collection, state) => {
        expect(state.get('position')).toBeUndefined();
        expect(state.get('complete')).toBeUndefined();
        state.set('position', 5);
        return collection.append([2]);
      }),
    ).toEqual([2]);
    expect(collector.state.get('position')).toBe(5);
    expect(collector.state.get('complete')).toBeUndefined();
  });

  it('commits accumulation only when runtime accepts loader data', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    commitLoaderData(await load(execution, () => collector.execute(request([1]))));
    discardLoaderData(await load(execution, () => collector.execute(request([99]))));
    const retry = await load(execution, () => collector.execute(request([2])));
    expect(commitLoaderData(retry)).toBe(true);
    expect(retry.values.get('list')).toEqual([1, 2]);
  });

  it('rolls back a successful callback when another participant fails', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    const failure = new Error('provider failed');
    await expect(
      execution.run(new AbortController().signal, async () => {
        await collector.execute(request([99]));
        throw failure;
      }),
    ).rejects.toBe(failure);
    const retry = await load(execution, () => collector.execute(request([1])));
    commitLoaderData(retry);
    expect(retry.values.get('list')).toEqual([1]);
  });

  it('discards cancellation after callback completion and before publication', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    const abort = new AbortController();
    const stale = await load(execution, () => collector.execute(request([99])), abort.signal);
    abort.abort();
    expect(commitLoaderData(stale)).toBe(false);
    const current = await load(execution, () => collector.execute(request([1])));
    expect(commitLoaderData(current)).toBe(true);
    expect(current.values.get('list')).toEqual([1]);
  });

  it('invalidates prepared loader data when reset precedes publication', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    const stale = await load(execution, () => collector.execute(request([99])));
    collector.reset();
    expect(commitLoaderData(stale)).toBe(false);
    const current = await load(execution, () => collector.execute(request([1])));
    expect(commitLoaderData(current)).toBe(true);
    expect(current.values.get('list')).toEqual([1]);
  });

  it('keeps reset pending if the runtime rejects the replacement', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    commitLoaderData(await load(execution, () => collector.execute(request([1]))));
    collector.reset();
    discardLoaderData(await load(execution, () => collector.execute(request([99]))));
    const retry = await load(execution, () => collector.execute(request([2])));
    expect(commitLoaderData(retry)).toBe(true);
    expect(retry.values.get('list')).toEqual([2]);
  });

  it('discards pending updates on owner disposal', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    const stale = await load(execution, () => collector.execute(request([99])));
    execution.dispose();
    expect(commitLoaderData(stale)).toBe(false);
  });
});

describe('Collector execution isolation', () => {
  it('does not attach a late loader to the next execution after interruption', async () => {
    const execution = new LoaderTransactionService();
    const collector = new Collector<number>(execution);
    const started = deferred<void>();
    const resume = deferred<void>();
    const old = load(execution, async () => {
      started.resolve();
      await resume.promise;
      return collector.execute(request([99]));
    }).catch((error) => error);
    await started.promise;
    execution.discardCurrent();
    const nextRequest = request([1]);
    const next = load(execution, () => collector.execute(nextRequest));
    await Promise.resolve();
    expect(nextRequest).not.toHaveBeenCalled();
    resume.resolve();
    expect(isRuntimeInterruption(await old)).toBe(true);
    const accepted = await next;
    expect(commitLoaderData(accepted)).toBe(true);
    expect(accepted.values.get('list')).toEqual([1]);
  });
});
