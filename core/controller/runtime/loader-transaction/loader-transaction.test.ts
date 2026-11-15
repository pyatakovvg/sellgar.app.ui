import { describe, expect, it, vi } from 'vitest';

import { createControllerLoaderData } from '../../data/controller-loader-data';
import { createRuntimeExecution } from '../../../runtime/operation/runtime-execution';
import { isRuntimeInterruption } from '../../../runtime/operation/runtime-interruption';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';

import { commitLoaderData, LoaderTransactionService } from './loader-transaction.ts';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });

  return { promise, resolve };
};

describe('Loader execution context', () => {
  it('releases a cancelled transaction without waiting for its loader and rejects its late commit', async () => {
    const service = new LoaderTransactionService();
    const started = deferred();
    const finish = deferred();
    const abort = new AbortController();
    const first = service.run(abort.signal, async () => {
      started.resolve();
      await finish.promise;
      return createControllerLoaderData([]);
    });
    const failure = first.catch((error) => error);
    await started.promise;
    abort.abort();
    expect(isRuntimeInterruption(await failure)).toBe(true);
    const next = await service.run(new AbortController().signal, async () => createControllerLoaderData([]));
    expect(commitLoaderData(next)).toBe(true);
    finish.resolve();
    await Promise.resolve();
    service.dispose();
  });

  it('releases a discarded session transaction even when the contained request never settles', async () => {
    const service = new LoaderTransactionService();
    const started = deferred();
    const first = service.run(new AbortController().signal, () => {
      started.resolve();
      return new Promise(() => {});
    });
    const failure = first.catch((error) => error);
    await started.promise;
    service.discardCurrent();
    expect(isRuntimeInterruption(await failure)).toBe(true);
    expect(
      commitLoaderData(await service.run(new AbortController().signal, async () => createControllerLoaderData([]))),
    ).toBe(true);
    service.dispose();
  });

  it('still cancels loader work after a participant discarded the transaction', async () => {
    const service = new LoaderTransactionService();
    const started = deferred();
    const abort = new AbortController();
    const first = service.run(abort.signal, () => {
      service.requireCurrent().discard();
      started.resolve();
      return new Promise(() => {});
    });
    const failure = first.catch((error) => error);
    await started.promise;
    abort.abort();
    expect(isRuntimeInterruption(await failure)).toBe(true);
    expect(
      commitLoaderData(await service.run(new AbortController().signal, async () => createControllerLoaderData([]))),
    ).toBe(true);
    service.dispose();
  });

  it('captures context per queued transaction without replacing the currently running one', async () => {
    const service = new LoaderTransactionService();
    const owner = new ApplicationScope();
    const first = createRuntimeExecution('load', owner);
    const second = createRuntimeExecution('revalidation', owner);
    const started = deferred();
    const finish = deferred();
    const signal = new AbortController().signal;

    try {
      const initial = service.run(
        signal,
        async () => {
          expect(service.requireCurrent().execution).toBe(first);
          started.resolve();
          await finish.promise;
          expect(service.requireCurrent().execution).toBe(first);
          return createControllerLoaderData([]);
        },
        first,
      );
      await started.promise;

      const revalidation = service.run(
        signal,
        async () => {
          expect(service.requireCurrent().execution).toBe(second);
          return createControllerLoaderData([]);
        },
        second,
      );

      expect(service.requireCurrent().execution).toBe(first);
      finish.resolve();

      expect(commitLoaderData(await initial)).toBe(true);
      expect(commitLoaderData(await revalidation)).toBe(true);
      expect(() => service.requireCurrent()).toThrow();
    } finally {
      finish.resolve();
      service.dispose();
      owner.dispose();
    }
  });

  it('does not install the context of a cancelled queued request', async () => {
    const service = new LoaderTransactionService();
    const owner = new ApplicationScope();
    const started = deferred();
    const finish = deferred();
    const abort = new AbortController();
    let cancelledWasCalled = false;

    try {
      const initial = service.run(
        new AbortController().signal,
        async () => {
          started.resolve();
          await finish.promise;
          return createControllerLoaderData([]);
        },
        createRuntimeExecution('load', owner),
      );
      await started.promise;

      const cancelled = service.run(
        abort.signal,
        async () => {
          cancelledWasCalled = true;
          return createControllerLoaderData([]);
        },
        createRuntimeExecution('revalidation', owner),
      );
      const failure = cancelled.catch((error) => error);
      abort.abort();
      finish.resolve();

      expect(commitLoaderData(await initial)).toBe(true);
      expect(isRuntimeInterruption(await failure)).toBe(true);
      expect(cancelledWasCalled).toBe(false);
      expect(() => service.requireCurrent()).toThrow();
    } finally {
      finish.resolve();
      service.dispose();
      owner.dispose();
    }
  });

  it('rejects running and queued work from the previous collection generation', async () => {
    const service = new LoaderTransactionService();
    const started = deferred();
    const finish = deferred();
    const signal = new AbortController().signal;
    const queued = vi.fn(async () => createControllerLoaderData([]));

    try {
      const first = service.run(signal, async () => {
        started.resolve();
        await finish.promise;
        return createControllerLoaderData([]);
      });
      const firstFailure = first.catch((error) => error);
      await started.promise;
      const second = service.run(signal, queued);
      const secondFailure = second.catch((error) => error);

      service.restartCollections();
      const current = service.run(signal, async () => createControllerLoaderData([]));
      finish.resolve();

      expect(isRuntimeInterruption(await firstFailure)).toBe(true);
      expect(isRuntimeInterruption(await secondFailure)).toBe(true);
      expect(queued).not.toHaveBeenCalled();
      expect(commitLoaderData(await current)).toBe(true);
    } finally {
      finish.resolve();
      service.dispose();
    }
  });

  it('does not publish a completed loader after its collection generation has changed', async () => {
    const service = new LoaderTransactionService();
    try {
      const data = await service.run(new AbortController().signal, async () => createControllerLoaderData([]));
      service.restartCollections();
      expect(commitLoaderData(data)).toBe(false);
    } finally {
      service.dispose();
    }
  });

  it('releases a failed execution before the next request begins', async () => {
    const service = new LoaderTransactionService();
    const owner = new ApplicationScope();
    const failure = new Error('Load failed.');
    const retry = createRuntimeExecution('revalidation', owner);

    try {
      await expect(
        service.run(
          new AbortController().signal,
          async () => {
            throw failure;
          },
          createRuntimeExecution('load', owner),
        ),
      ).rejects.toBe(failure);
      expect(() => service.requireCurrent()).toThrow();

      const data = await service.run(
        new AbortController().signal,
        async () => {
          expect(service.requireCurrent().execution).toBe(retry);
          return createControllerLoaderData([]);
        },
        retry,
      );

      expect(commitLoaderData(data)).toBe(true);
      expect(() => service.requireCurrent()).toThrow();
    } finally {
      service.dispose();
      owner.dispose();
    }
  });
});
