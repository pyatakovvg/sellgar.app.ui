import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Controller, type ControllerArgs } from '../../../controller/contract/controller';
import { Inject } from '../../../di/injection/decorators';
import type { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import { ModuleRuntime } from '../../../module/runtime/module-runtime';
import {
  LoaderTransactionService,
  commitLoaderData,
  type LoaderTransaction,
} from '../../../controller/runtime/loader-transaction';
import { createControllerLoaderData } from '../../../controller/data/controller-loader-data';
import type { RuntimeExecution } from '../../../runtime/operation/runtime-execution';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { Provider, type ProviderInterface } from '../../../runtime/provider/provider';
import { WidgetRuntime } from '../../../widget/runtime/widget-runtime';
import {
  WidgetDefinition,
  configureWidgetRuntimeDefinition,
  getWidgetRuntimeDefinition,
} from '../../../widget/declaration/widget';
import { Collector } from './collector.ts';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};

@Controller()
class ListController {
  static read = vi.fn<(position?: number) => Promise<{ entries: number[]; following: number }>>();
  static instance: ListController;
  static signals: AbortSignal[] = [];
  static executions: RuntimeExecution[] = [];
  static transactions: LoaderTransaction[] = [];

  constructor(
    @Inject(Collector) readonly collector: Collector<number, { position: number }>,
    @Inject(LoaderTransactionService) private readonly transactions: LoaderTransactionService,
  ) {
    ListController.instance = this;
  }

  loader(args: ControllerArgs): Promise<number[]> {
    ListController.signals.push(args.signal);
    const transaction = this.transactions.requireCurrent();
    ListController.transactions.push(transaction);
    const execution = transaction.execution;
    if (!execution) throw new Error('Loader execution context is missing.');
    ListController.executions.push(execution);
    return this.collector.execute(async (collection, state) => {
      const response = await ListController.read(state.get('position'));
      state.set('position', response.following);
      return collection.append(response.entries);
    });
  }
}

@Controller()
class OtherController {
  static read = vi.fn<() => Promise<number[]>>().mockResolvedValue([101]);
  loader(): Promise<number[]> {
    return OtherController.read();
  }
}

@Provider()
class ListProvider implements ProviderInterface {
  static refresh = vi.fn<() => Promise<void>>();

  revalidate(): Promise<void> {
    return ListProvider.refresh();
  }

  dispose(): void {}
}

class ListBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(Collector).toSelf().inSingletonScope();
    registry.bind(ListController).toSelf().inSingletonScope();
    registry.bind(OtherController).toSelf().inSingletonScope();
  }
}

@UseBindings(ListBindings)
class ListModule {}

@UseBindings(ListBindings)
class ListWidget extends WidgetDefinition {}

configureWidgetRuntimeDefinition(ListWidget, { providers: [ListProvider] });

const setup = async (kind: 'module' | 'widget') => {
  const scope = new ApplicationScope();
  if (kind === 'widget') {
    const runtime = new WidgetRuntime(scope, getWidgetRuntimeDefinition(ListWidget), {});
    await runtime.load();
    return { runtime, scope };
  }

  const definition = createModuleRuntimeDefinition({
    token: ListModule,
    presentation: null,
    providers: [ListProvider],
  });
  const runtime = new ModuleRuntime(
    scope,
    async () => ({ module: ListModule }),
    { resolve: () => definition },
    { kind: 'route', id: 'collector-test' },
  );
  await runtime.load({ params: {}, props: {}, signal: new AbortController().signal });
  runtime.commit();
  return { runtime, scope };
};

describe.each(['module', 'widget'] as const)('Collector in %s runtime', (kind) => {
  beforeEach(() => {
    ListController.signals = [];
    OtherController.read = vi.fn().mockResolvedValue([101]);
    ListController.executions = [];
    ListController.transactions = [];
    ListController.read = vi.fn().mockResolvedValue({ entries: [1], following: 10 });
    ListProvider.refresh = vi.fn().mockResolvedValue(undefined);
  });

  it('isolates execution contexts for the same controller token in independent scopes', async () => {
    const first = await setup(kind);
    const second = await setup(kind);

    try {
      const [firstLoad, secondLoad] = ListController.executions;
      expect(firstLoad!.kind).toBe('load');
      expect(secondLoad!.kind).toBe('load');
      expect(firstLoad!.navigation).toBeNull();
      expect(secondLoad!.navigation).toBeNull();
      expect(firstLoad!.owner).not.toBe(secondLoad!.owner);

      await Promise.all([first.runtime.revalidate(), second.runtime.revalidate()]);

      const revalidations = ListController.executions.slice(2);
      expect(revalidations).toHaveLength(2);
      expect(new Set(revalidations.map((execution) => execution.owner))).toEqual(
        new Set([firstLoad!.owner, secondLoad!.owner]),
      );
      expect(
        revalidations.every((execution) => execution.kind === 'revalidation' && execution.navigation === null),
      ).toBe(true);
      expect(new Set(ListController.executions.map((execution) => execution.id)).size).toBe(4);
    } finally {
      await first.runtime.dispose();
      await second.runtime.dispose();
      first.scope.dispose();
      second.scope.dispose();
    }
  });

  it('publishes accumulated arrays and consumer state together', async () => {
    const { runtime, scope } = await setup(kind);
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();
    expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    expect(ListController.instance.collector.state.get('position')).toBe(20);
    await runtime.dispose();
    scope.dispose();
  });

  it('does not advance state when the provider fails after a successful request', async () => {
    const { runtime, scope } = await setup(kind);
    const previous = runtime.getLoaderData(ListController);
    const failure = new Error('provider failed');
    const ready = deferred();
    const finish = deferred();
    ListController.read.mockImplementationOnce(async () => {
      ready.resolve();
      return { entries: [99], following: 99 };
    });
    ListProvider.refresh.mockImplementationOnce(async () => {
      await finish.promise;
      throw failure;
    });
    const refresh = runtime.revalidate();
    const rejected = refresh.catch((error) => error);
    await ready.promise;
    await Promise.resolve();
    finish.resolve();
    expect(await rejected).toBe(failure);
    expect(runtime.getLoaderData(ListController)).toBe(previous);
    expect(ListController.instance.collector.state.get('position')).toBe(10);
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();
    expect(ListController.read).toHaveBeenLastCalledWith(10);
    expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    await runtime.dispose();
    scope.dispose();
  });

  it('discards an accepted request if revalidation is cancelled before publication', async () => {
    const { runtime, scope } = await setup(kind);
    const abort = new AbortController();
    const ready = deferred();
    const finish = deferred();
    ListController.read.mockImplementationOnce(async () => {
      ready.resolve();
      return { entries: [99], following: 99 };
    });
    ListProvider.refresh.mockImplementationOnce(() => finish.promise);
    const refresh = runtime.revalidate({ signal: abort.signal });
    await ready.promise;
    await Promise.resolve();
    abort.abort();
    finish.resolve();
    await refresh;
    expect(runtime.getLoaderData(ListController)).toEqual([1]);
    expect(ListController.instance.collector.state.get('position')).toBe(10);
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();
    expect(ListController.read).toHaveBeenLastCalledWith(10);
    expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    await runtime.dispose();
    scope.dispose();
  });

  it('starts a new collection on owner restart without replacing controllers', async () => {
    const { runtime, scope } = await setup(kind);
    const controller = ListController.instance;
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();

    ListController.read.mockResolvedValueOnce({ entries: [3], following: 30 });
    await runtime.revalidate({ restartCollections: true });

    expect(ListController.instance).toBe(controller);
    expect(ListController.read).toHaveBeenLastCalledWith(undefined);
    expect(runtime.getLoaderData(ListController)).toEqual([3]);
    expect(controller.collector.state.get('position')).toBe(30);
    await runtime.dispose();
    scope.dispose();
  });

  it('keeps the new selection pending when its provider fails and retries from the beginning', async () => {
    const { runtime, scope } = await setup(kind);
    const previous = runtime.getLoaderData(ListController);
    ListController.read.mockResolvedValueOnce({ entries: [99], following: 99 });
    ListProvider.refresh.mockRejectedValueOnce(new Error('replacement provider failed'));

    await expect(runtime.revalidate({ restartCollections: true })).rejects.toThrow('replacement provider failed');
    expect(runtime.getLoaderData(ListController)).toBe(previous);
    expect(ListController.instance.collector.state.get('position')).toBe(10);

    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();
    expect(ListController.read).toHaveBeenLastCalledWith(undefined);
    expect(runtime.getLoaderData(ListController)).toEqual([2]);
    await runtime.dispose();
    scope.dispose();
  });

  it('does not restart independent owners sharing the same controller token', async () => {
    const first = await setup(kind);
    const second = await setup(kind);
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await first.runtime.revalidate({ restartCollections: true });
    expect(first.runtime.getLoaderData(ListController)).toEqual([2]);
    ListController.read.mockResolvedValueOnce({ entries: [3], following: 30 });
    await second.runtime.revalidate();
    expect(ListController.read).toHaveBeenLastCalledWith(10);
    expect(second.runtime.getLoaderData(ListController)).toEqual([1, 3]);
    await first.runtime.dispose();
    await second.runtime.dispose();
    first.scope.dispose();
    second.scope.dispose();
  });

  it('preserves continuation when the restart request was already cancelled', async () => {
    const { runtime, scope } = await setup(kind);
    const abort = new AbortController();
    abort.abort();
    await runtime.revalidate({ restartCollections: true, signal: abort.signal });
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();
    expect(ListController.read).toHaveBeenLastCalledWith(10);
    expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    await runtime.dispose();
    scope.dispose();
  });

  it('keeps reset pending after a failed replacement request', async () => {
    const { runtime, scope } = await setup(kind);
    ListController.instance.collector.reset();
    ListController.read.mockRejectedValueOnce(new Error('replacement failed'));
    await expect(runtime.revalidate()).rejects.toThrow('replacement failed');
    expect(runtime.getLoaderData(ListController)).toEqual([1]);
    expect(ListController.instance.collector.state.get('position')).toBe(10);
    ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await runtime.revalidate();
    expect(ListController.read).toHaveBeenLastCalledWith(undefined);
    expect(runtime.getLoaderData(ListController)).toEqual([2]);
    await runtime.dispose();
    scope.dispose();
  });
});

it('keeps the owner generation for a collector omitted from the first replacement load', async () => {
  const service = new LoaderTransactionService();
  const first = new Collector<number, { position: number }>(service);
  const second = new Collector<number, { position: number }>(service);
  const read = vi.fn<(position?: number) => Promise<number[]>>().mockResolvedValue([1]);
  const collect = (collector: typeof first) =>
    collector.execute(async (collection, state) => {
      const items = await read(state.get('position'));
      state.set('position', 10);
      return collection.append(items);
    });
  const load = async (collector: typeof first) => {
    const data = await service.run(new AbortController().signal, async () =>
      createControllerLoaderData([{ controller: ListController, value: await collect(collector) }]),
    );
    expect(commitLoaderData(data)).toBe(true);
  };

  try {
    await load(first);
    await load(second);
    service.restartCollections();
    await load(first);
    await load(second);
    expect(read).toHaveBeenLastCalledWith(undefined);
    expect(second.state.get('position')).toBe(10);
  } finally {
    service.dispose();
  }
});

describe('Module route-provider transaction', () => {
  it.each(['sync', 'early', 'late'] as const)(
    'discards the whole loader result after a %s route-provider failure',
    async (failure) => {
      ListController.transactions = [];
      ListController.read = vi.fn().mockResolvedValue({ entries: [1], following: 10 });
      ListProvider.refresh = vi.fn().mockResolvedValue(undefined);
      const { runtime, scope } = await setup('module');
      if (!(runtime instanceof ModuleRuntime)) throw new Error('Expected a Module runtime.');

      const error = new Error('route-provider failed');
      const providerReady = deferred();
      const requestReady = deferred();
      const started = deferred();
      const previous = runtime.getLoaderData(ListController);
      ListController.read.mockImplementationOnce(async () => {
        started.resolve();
        if (failure !== 'late') await requestReady.promise;
        return { entries: [2], following: 20 };
      });

      const refresh = runtime
        .revalidate({
          lifecycle: {
            revalidate: () => {
              if (failure === 'sync') throw error;
              return providerReady.promise.then(() => {
                throw error;
              });
            },
          },
        })
        .catch((cause: unknown) => cause);

      try {
        await started.promise;
        await vi.waitFor(() => expect(ListController.read).toHaveBeenCalledTimes(2));
        if (failure === 'late') await new Promise<void>((resolve) => setTimeout(resolve, 0));
        providerReady.resolve();
        requestReady.resolve();
        expect(await refresh).toBe(error);

        const transaction = ListController.transactions.at(-1);
        if (!transaction) throw new Error('Loader transaction is missing.');
        expect(() => transaction.assertCurrent()).toThrow();
        expect(runtime.getLoaderData(ListController)).toBe(previous);
        expect(ListController.instance.collector.state.get('position')).toBe(10);

        ListController.read.mockResolvedValueOnce({ entries: [3], following: 30 });
        await runtime.revalidate();
        expect(ListController.read).toHaveBeenLastCalledWith(10);
        expect(runtime.getLoaderData(ListController)).toEqual([1, 3]);
      } finally {
        providerReady.resolve();
        requestReady.resolve();
        await runtime.dispose();
        scope.dispose();
      }
    },
  );
});

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
describe.each(['module', 'widget'] as const)('Loader admission in %s', (kind) => {
  beforeEach(() => {
    ListController.read = vi.fn().mockResolvedValue({ entries: [1], following: 10 });
    ListController.signals = [];
    ListController.executions = [];
    ListController.transactions = [];
    OtherController.read = vi.fn().mockResolvedValue([101]);
    ListProvider.refresh = vi.fn().mockResolvedValue(undefined);
  });

  it.each(['targeted', 'general'] as const)(
    'drops repeated %s launches until the current loader finishes',
    async (mode) => {
      const { runtime, scope } = await setup(kind);
      const ready = deferred();
      const finish = deferred();
      const calls: Promise<void>[] = [];
      try {
        ListController.read.mockImplementationOnce(async () => {
          ready.resolve();
          await finish.promise;
          return { entries: [2], following: 20 };
        });
        const options = mode === 'targeted' ? { controllerToken: ListController } : {};
        calls.push(runtime.revalidate(options), runtime.revalidate(options));
        await ready.promise;
        for (let batch = 0; batch < 5; batch++) {
          for (let event = 0; event < 20; event++) calls.push(runtime.revalidate(options));
          await turn();
        }
        expect(ListController.signals.at(-1)?.aborted).toBe(false);
        finish.resolve();
        await Promise.all(calls);
        await turn();
        expect(ListController.read).toHaveBeenCalledTimes(2);
        expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
      } finally {
        finish.resolve();
        await Promise.allSettled(calls);
        await runtime.dispose();
        scope.dispose();
      }
    },
  );

  it('does not launch or queue general revalidation while a targeted loader runs', async () => {
    const { runtime, scope } = await setup(kind);
    const ready = deferred();
    const finish = deferred();
    const calls: Promise<void>[] = [];
    try {
      ListController.read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        return { entries: [2], following: 20 };
      });
      calls.push(runtime.revalidate({ controllerToken: ListController }));
      await ready.promise;
      for (let event = 0; event < 20; event++) calls.push(runtime.revalidate());
      finish.resolve();
      await Promise.all(calls);
      await turn();
      expect(ListController.read).toHaveBeenCalledTimes(2);
      expect(OtherController.read).toHaveBeenCalledTimes(1);
      expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    } finally {
      finish.resolve();
      await Promise.allSettled(calls);
      await runtime.dispose();
      scope.dispose();
    }
  });

  it('does not repeat a loader already participating in general revalidation', async () => {
    const { runtime, scope } = await setup(kind);
    const ready = deferred();
    const finish = deferred();
    const calls: Promise<void>[] = [];
    try {
      ListController.read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        return { entries: [2], following: 20 };
      });
      calls.push(runtime.revalidate());
      await ready.promise;
      calls.push(runtime.revalidate({ controllerToken: ListController }));
      finish.resolve();
      await Promise.all(calls);
      expect(ListController.read).toHaveBeenCalledTimes(2);
      expect(OtherController.read).toHaveBeenCalledTimes(2);
      expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    } finally {
      finish.resolve();
      await Promise.allSettled(calls);
      await runtime.dispose();
      scope.dispose();
    }
  });

  it('keeps independent controller requests without cancelling the active loader', async () => {
    const { runtime, scope } = await setup(kind);
    const ready = deferred();
    const finish = deferred();
    const calls: Promise<void>[] = [];
    try {
      ListController.read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        return { entries: [2], following: 20 };
      });
      OtherController.read.mockResolvedValue([102]);
      calls.push(runtime.revalidate({ controllerToken: ListController }));
      await ready.promise;
      calls.push(
        runtime.revalidate({ controllerToken: OtherController }),
        runtime.revalidate({ controllerToken: OtherController }),
      );
      calls.push(runtime.revalidate());
      finish.resolve();
      await Promise.all(calls);
      expect(ListController.signals.at(-1)?.aborted).toBe(false);
      expect(OtherController.read).toHaveBeenCalledTimes(2);
      expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
      expect(runtime.getLoaderData(OtherController)).toEqual([102]);
    } finally {
      finish.resolve();
      await Promise.allSettled(calls);
      await runtime.dispose();
      scope.dispose();
    }
  });

  it.each(['before', 'after'] as const)('ignores a repeated caller cancelled %s admission', async (when) => {
    const { runtime, scope } = await setup(kind);
    const ready = deferred();
    const finish = deferred();
    const abort = new AbortController();
    try {
      ListController.read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        return { entries: [2], following: 20 };
      });
      const first = runtime.revalidate({ controllerToken: ListController });
      await ready.promise;
      if (when === 'before') abort.abort();
      const repeated = runtime.revalidate({ controllerToken: ListController, signal: abort.signal });
      if (when === 'after') abort.abort();
      finish.resolve();
      await Promise.all([first, repeated]);
      expect(ListController.signals.at(-1)?.aborted).toBe(false);
      expect(ListController.read).toHaveBeenCalledTimes(2);
      expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    } finally {
      finish.resolve();
      await runtime.dispose();
      scope.dispose();
    }
  });

  it('unlocks a cancelled loader after completion and permits a new explicit call', async () => {
    const { runtime, scope } = await setup(kind);
    const ready = deferred();
    const finish = deferred();
    const abort = new AbortController();
    try {
      ListController.read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        return { entries: [99], following: 99 };
      });
      const first = runtime.revalidate({ controllerToken: ListController, signal: abort.signal });
      await ready.promise;
      abort.abort();
      const repeated = runtime.revalidate({ controllerToken: ListController });
      finish.resolve();
      await Promise.all([first, repeated]);
      expect(ListController.read).toHaveBeenCalledTimes(2);
      expect(runtime.getLoaderData(ListController)).toEqual([1]);
      ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
      await runtime.revalidate({ controllerToken: ListController });
      expect(ListController.read).toHaveBeenLastCalledWith(10);
      expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    } finally {
      finish.resolve();
      await runtime.dispose();
      scope.dispose();
    }
  });

  it('allows the next explicit call after a failed loader without scheduling repeated launches', async () => {
    const { runtime, scope } = await setup(kind);
    const ready = deferred();
    const finish = deferred();
    const failure = new Error('failed');
    try {
      ListController.read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        throw failure;
      });
      const first = runtime.revalidate({ controllerToken: ListController });
      await ready.promise;
      const repeated = runtime.revalidate({ controllerToken: ListController });
      const outcomes = Promise.allSettled([first, repeated]);
      finish.resolve();
      expect(await outcomes).toEqual([
        { status: 'rejected', reason: failure },
        { status: 'rejected', reason: failure },
      ]);
      expect(ListController.read).toHaveBeenCalledTimes(2);
      ListController.read.mockResolvedValueOnce({ entries: [2], following: 20 });
      await runtime.revalidate({ controllerToken: ListController });
      expect(ListController.read).toHaveBeenLastCalledWith(10);
      expect(runtime.getLoaderData(ListController)).toEqual([1, 2]);
    } finally {
      finish.resolve();
      await runtime.dispose();
      scope.dispose();
    }
  });
});
