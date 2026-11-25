import { describe, expect, it, vi } from 'vitest';

import { Controller, type ControllerArgs } from '../../../controller/contract/controller';
import { Inject } from '../../../di/injection/decorators';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import { ModuleRuntime } from '../../../module/runtime/module-runtime';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { Feature } from '../../../application/feature/application-feature';
import { ApplicationFeaturesRuntime } from '../../../application/feature/application-features-runtime';
import { SessionRuntimeState, SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { ApplicationReportDispatcherInterface } from '../../../application/reporting/application-report';
import { WidgetRuntime } from '../../../widget/runtime/widget-runtime';
import {
  WidgetDefinition,
  configureWidgetRuntimeDefinition,
  getWidgetRuntimeDefinition,
} from '../../../widget/declaration/widget';

import { InjectCollector } from '../../declaration/inject-collector';
import { CollectorServiceInterface } from '../../service/collector-service';
import { CollectorInterface } from './collector.interface.ts';

type RuntimeKind = 'module' | 'widget' | 'application';
type Position = { position: number };

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};

const fixture = (
  configuration: {
    rowsKey?: string;
    optionsKey?: string;
    constructorError?: () => Error | undefined;
    beforeLoad?: (collections: CollectorServiceInterface) => void;
    readMetadata?: () => Promise<number>;
  } = {},
) => {
  const readRows = vi.fn(async (position: number | undefined): Promise<number> => (position ?? 0) + 1);
  const readOptions = vi.fn(async (position: number | undefined): Promise<number> => (position ?? 99) + 1);
  const userDispose = vi.fn<() => void | Promise<void>>();
  const signals: AbortSignal[] = [];
  const controls: CollectorServiceInterface[] = [];
  const instances: ListController[] = [];

  @Controller()
  class ListController {
    constructor(
      @InjectCollector(configuration.rowsKey ?? 'rows') readonly rows: CollectorInterface<number, Position>,
      @InjectCollector(configuration.optionsKey ?? 'options') readonly options: CollectorInterface<number, Position>,
    ) {
      instances.push(this);
      const error = configuration.constructorError?.();
      if (error) throw error;
    }

    async loader(args: ControllerArgs) {
      signals.push(args.signal);
      const [rows, options] = await Promise.all([
        this.rows.execute(async (collection, state) => {
          const value = await readRows(state.get('position'));
          state.set('position', value);
          return collection.append([value]);
        }),
        this.options.execute(async (collection, state) => {
          const value = await readOptions(state.get('position'));
          state.set('position', value);
          return collection.append([value]);
        }),
      ]);
      return { rows, options };
    }

    dispose() {
      return userDispose();
    }
  }

  @Controller()
  class FiltersController {
    constructor(@Inject(CollectorServiceInterface) readonly collections: CollectorServiceInterface) {
      controls.push(collections);
      configuration.beforeLoad?.(collections);
    }

    loader() {
      return configuration.readMetadata?.();
    }
  }

  @Controller()
  class MoreFiltersController {
    constructor(@Inject(CollectorServiceInterface) readonly collections: CollectorServiceInterface) {}
  }

  class Bindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(ListController).toSelf();
      registry.bind(FiltersController).toSelf();
      registry.bind(MoreFiltersController).toSelf();
    }
  }

  @UseBindings(Bindings)
  class ListModule {}

  @UseBindings(Bindings)
  class ListWidget extends WidgetDefinition {}
  configureWidgetRuntimeDefinition(ListWidget, {});

  @UseBindings(Bindings)
  @Feature()
  class ListFeature {}

  const host = (kind: RuntimeKind, scope = new ApplicationScope()) => {
    const signal = new AbortController().signal;
    const definition = createModuleRuntimeDefinition({ token: ListModule, presentation: null, providers: [] });
    const runtime =
      kind === 'module'
        ? new ModuleRuntime(
            scope,
            async () => ({ module: ListModule }),
            { resolve: () => definition },
            { kind: 'route', id: 'owned-collector-test' },
          )
        : kind === 'widget'
          ? new WidgetRuntime(scope, getWidgetRuntimeDefinition(ListWidget), {})
          : (() => {
              scope.bindSession(new SessionRuntimeState());
              const features = scope.activateFeatures([ListFeature]);
              return new ApplicationFeaturesRuntime(scope, [ListFeature], features);
            })();
    const load = async () => {
      if (runtime instanceof ModuleRuntime) {
        await runtime.load({ params: {}, props: {}, signal });
        runtime.commit();
      } else await runtime.load();
    };
    const dispose = async () => {
      await runtime.dispose();
      await scope.disposeProviders();
      scope.dispose();
    };
    return { runtime, scope, load, dispose };
  };

  return {
    ListController,
    FiltersController,
    MoreFiltersController,
    readRows,
    readOptions,
    instances,
    signals,
    controls,
    userDispose,
    host,
  };
};

describe.each(['module', 'widget', 'application'] as const)('owned Collector in actual %s runtime', (kind) => {
  it('registers keys before normal loaders so another controller can reset an unstarted collection', async () => {
    const reset = vi.fn((collections: CollectorServiceInterface) => collections.reset('rows'));
    const f = fixture({ beforeLoad: reset });
    const h = f.host(kind);
    try {
      await h.load();
      expect(reset).toHaveBeenCalledOnce();
      expect(f.readRows).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
    } finally {
      await h.dispose();
    }
  });

  it('injects separate accumulators and resets a named peer through a separate transient service', async () => {
    const f = fixture();
    const first = f.host(kind);
    const second = f.host(kind);
    try {
      await first.load();
      await second.load();
      const left = first.runtime.getController(f.ListController);
      const right = second.runtime.getController(f.ListController);
      const filter = first.runtime.getController(f.FiltersController);
      expect(filter.collections).not.toBe(first.runtime.getController(f.MoreFiltersController).collections);
      expect(left.rows).not.toBe(left.options);
      expect(left.rows).not.toBe(right.rows);
      expect(f.controls[0]).not.toBe(f.controls[1]);
      filter.collections.reset('rows');
      expect(left.rows.state.get('position')).toBe(1);
      expect(left.options.state.get('position')).toBe(100);
      await first.runtime.revalidate({ controllerToken: f.ListController });
      await second.runtime.revalidate({ controllerToken: f.ListController });
      expect(first.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100, 101] });
      expect(second.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1, 2], options: [100, 101] });
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });

  it('rejects unknown and invalid reset keys without resetting accepted collections', async () => {
    const f = fixture();
    const h = f.host(kind);
    try {
      await h.load();
      const control = h.runtime.getController(f.FiltersController).collections;
      for (const key of ['unknown', '', null, undefined, 1]) {
        expect(() => control.reset(key as never)).toThrow();
      }
      await h.runtime.revalidate({ controllerToken: f.ListController });
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1, 2], options: [100, 101] });
    } finally {
      await h.dispose();
    }
  });

  it('retains accepted rows and the pending reset when a replacement fails', async () => {
    const f = fixture();
    const h = f.host(kind);
    try {
      await h.load();
      const previous = h.runtime.getLoaderData(f.ListController);
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      f.readRows.mockRejectedValueOnce(new Error('replacement unavailable'));
      await expect(h.runtime.revalidate({ controllerToken: f.ListController })).rejects.toThrow(
        'replacement unavailable',
      );
      expect(h.runtime.getLoaderData(f.ListController)).toBe(previous);
      expect(h.runtime.getController(f.ListController).options.state.get('position')).toBe(100);
      await h.runtime.revalidate({ controllerToken: f.ListController });
      expect(f.readRows).toHaveBeenLastCalledWith(undefined);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100, 101] });
    } finally {
      await h.dispose();
    }
  });

  it('discards a shared prepared batch when addressed reset invalidates its target, without clearing accepted siblings', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    try {
      await h.load();
      const previous = h.runtime.getLoaderData(f.ListController);
      const controller = h.runtime.getController(f.ListController);
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const pending = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      expect(controller.rows.state.get('position')).toBe(1);
      expect(controller.options.state.get('position')).toBe(100);
      finish.resolve(999);
      await pending;
      expect(h.runtime.getLoaderData(f.ListController)).toBe(previous);
      expect(controller.options.state.get('position')).toBe(100);
      await h.runtime.revalidate({ controllerToken: f.ListController });
      expect(f.readRows).toHaveBeenLastCalledWith(undefined);
      expect(f.readOptions).toHaveBeenLastCalledWith(100);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100, 101] });
    } finally {
      finish.resolve(999);
      await h.dispose();
    }
  });

  it.each(['targeted', 'general'] as const)(
    'loads the replacement after reset during a pending %s refresh without waiting for its obsolete response',
    async (mode) => {
      const f = fixture();
      const h = f.host(kind);
      const started = deferred<void>();
      const finish = deferred<number>();
      const calls: Promise<void>[] = [];
      try {
        await h.load();
        f.readRows.mockImplementationOnce(async () => {
          started.resolve();
          return finish.promise;
        });
        calls.push(h.runtime.revalidate(mode === 'targeted' ? { controllerToken: f.ListController } : {}));
        await started.promise;
        h.runtime.getController(f.FiltersController).collections.reset('rows');
        f.readRows.mockResolvedValueOnce(3);
        for (let event = 0; event < 10; event++) {
          calls.push(h.runtime.revalidate({ controllerToken: f.ListController }));
        }
        await vi.waitFor(() =>
          expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [3], options: [100, 101] }),
        );
        await Promise.all(calls);
        expect(f.signals.at(-2)?.aborted).toBe(true);
        expect(f.readRows).toHaveBeenCalledTimes(3);
        expect(f.readRows).toHaveBeenLastCalledWith(undefined);
        finish.resolve(999);
        await Promise.resolve();
        expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [3], options: [100, 101] });
      } finally {
        finish.resolve(999);
        await Promise.allSettled(calls);
        await h.dispose();
      }
    },
  );

  it('fulfils the original general refresh including metadata after targeted paging was reset', async () => {
    const readMetadata = vi.fn(async () => 123);
    const f = fixture({ readMetadata });
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const paging = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      f.readRows.mockResolvedValueOnce(3);
      const replacement = h.runtime.revalidate();
      await Promise.all([paging, replacement]);
      expect(readMetadata).toHaveBeenCalledTimes(2);
      expect(h.runtime.getLoaderData(f.FiltersController)).toBe(123);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [3], options: [100, 101] });
    } finally {
      finish.resolve(999);
      await h.dispose();
    }
  });

  it('keeps reset pending when the replacement queued behind obsolete paging fails', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    try {
      await h.load();
      const previous = h.runtime.getLoaderData(f.ListController);
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const paging = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      f.readRows.mockRejectedValueOnce(new Error('replacement failed'));
      const replacement = h.runtime.revalidate({ controllerToken: f.ListController });
      finish.resolve(999);
      await paging;
      await expect(replacement).rejects.toThrow('replacement failed');
      expect(h.runtime.getLoaderData(f.ListController)).toBe(previous);
      f.readRows.mockResolvedValueOnce(3);
      await h.runtime.revalidate({ controllerToken: f.ListController });
      expect(f.readRows).toHaveBeenLastCalledWith(undefined);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [3], options: [100, 101] });
    } finally {
      finish.resolve(999);
      await h.dispose();
    }
  });

  it('does not revive a joined request from the preceding session revision', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    if (!h.scope.has(SessionRuntimeStateInterface)) h.scope.bindSession(new SessionRuntimeState());
    const session = h.scope.get(SessionRuntimeStateInterface);
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const first = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const joined = h.runtime.revalidate({ controllerToken: f.ListController });
      session.setAuthenticated();
      finish.resolve(99);
      await Promise.all([first, joined]);
      expect(f.readRows).toHaveBeenCalledTimes(2);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
    } finally {
      finish.resolve(99);
      await h.dispose();
    }
  });
  it('does not revive joined work if owner scope is suspended then immediately resumed', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const first = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const joined = h.runtime.revalidate({ controllerToken: f.ListController });
      h.scope.suspendRequests();
      h.scope.resumeRequests();
      await Promise.all([first, joined]);
      expect(f.readRows).toHaveBeenCalledTimes(2);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
    } finally {
      finish.resolve(99);
      await h.dispose();
    }
  });
  it('does not replay after joined caller aborts', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    const caller = new AbortController();
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const first = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const joined = h.runtime.revalidate({ controllerToken: f.ListController, signal: caller.signal });
      caller.abort();
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      await Promise.all([first, joined]);
      expect(f.readRows).toHaveBeenCalledTimes(2);
    } finally {
      finish.resolve(99);
      await h.dispose();
    }
  });
  it('does not replay after disposal begins', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const first = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const joined = h.runtime.revalidate({ controllerToken: f.ListController });
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      const disposal = h.runtime.dispose();
      await Promise.all([first, joined, disposal]);
      expect(f.readRows).toHaveBeenCalledTimes(2);
    } finally {
      finish.resolve(99);
      await h.dispose();
    }
  });
  it('does not replay when owner request scope was suspended while runtime still exists', async () => {
    const f = fixture();
    const h = f.host(kind);
    const started = deferred<void>();
    const finish = deferred<number>();
    let signalReads = 0;
    const original = h.scope.getRequestSignal.bind(h.scope);
    const spy = vi.spyOn(h.scope, 'getRequestSignal').mockImplementation(() => {
      if (++signalReads > 30) throw new Error('Unbounded retry after owner scope aborted');
      return original();
    });
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const first = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const joined = h.runtime.revalidate({ controllerToken: f.ListController });
      h.scope.suspendRequests();
      await Promise.all([first, joined]);
      expect(f.readRows).toHaveBeenCalledTimes(2);
      expect(signalReads).toBeLessThan(20);
    } finally {
      spy.mockRestore();
      finish.resolve(99);
      await h.dispose();
    }
  });
  it('queues a new replacement independently of a completed failure awaiting its reporter', async () => {
    const f = fixture();
    const h = f.host(kind);
    const reported = deferred<void>();
    const finishReport = deferred<void>();
    const report = vi
      .spyOn(h.scope.get(ApplicationReportDispatcherInterface), 'report')
      .mockImplementation(async () => {
        reported.resolve();
        await finishReport.promise;
      });
    try {
      await h.load();
      f.readRows.mockRejectedValueOnce(new Error('old request failed'));
      const failed = h.runtime.revalidate({ controllerToken: f.ListController });
      const failure = failed.catch((error: unknown) => error);
      await reported.promise;
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      f.readRows.mockResolvedValueOnce(3);
      const replacement = h.runtime.revalidate({ controllerToken: f.ListController });
      finishReport.resolve();
      expect(await failure).toEqual(new Error('old request failed'));
      await replacement;
      expect(f.readRows).toHaveBeenLastCalledWith(undefined);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [3], options: [100, 101] });
    } finally {
      finishReport.resolve();
      report.mockRestore();
      await h.dispose();
    }
  });

  it('revokes both the accumulator and the addressed reset capability before asynchronous user cleanup', async () => {
    const f = fixture();
    const h = f.host(kind);
    await h.load();
    const old = h.runtime.getController(f.ListController);
    const control = h.runtime.getController(f.FiltersController).collections;
    const cleanupStarted = deferred<void>();
    const cleanupFinished = deferred<void>();
    f.userDispose.mockImplementation(async () => {
      cleanupStarted.resolve();
      await cleanupFinished.promise;
    });
    const disposal = h.runtime.dispose();
    await cleanupStarted.promise;
    try {
      expect(() => control.reset('rows')).toThrow();
      expect(() => old.rows.reset()).toThrow();
      expect(() => old.rows.state.get('position')).toThrow();
      await expect(
        Promise.resolve().then(() => old.rows.execute(async (collection) => collection.append([99]))),
      ).rejects.toThrow();
    } finally {
      cleanupFinished.resolve();
      await disposal;
      await h.dispose();
    }
  });

  it('does not let an old pending callback publish into another runtime reusing the same keys', async () => {
    const f = fixture();
    const oldHost = f.host(kind);
    const newHost = f.host(kind);
    const started = deferred<void>();
    const finishOld = deferred<number>();
    try {
      await oldHost.load();
      const old = oldHost.runtime.getController(f.ListController);
      const oldControl = oldHost.runtime.getController(f.FiltersController).collections;
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finishOld.promise;
      });
      const pending = oldHost.runtime.revalidate({ controllerToken: f.ListController });
      const settled = pending.catch((error: unknown) => error);
      await started.promise;
      const disposal = oldHost.runtime.dispose();
      await newHost.load();
      finishOld.resolve(999);
      await settled;
      await disposal;
      expect(() => oldControl.reset('rows')).toThrow();
      expect(() => old.rows.reset()).toThrow();
      expect(newHost.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
      await newHost.runtime.revalidate({ controllerToken: f.ListController });
      expect(newHost.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1, 2], options: [100, 101] });
    } finally {
      finishOld.resolve(999);
      await oldHost.dispose();
      await newHost.dispose();
    }
  });

  it('keeps resources revoked while reporting a failed user cleanup asynchronously', async () => {
    const f = fixture();
    const h = f.host(kind);
    await h.load();
    const old = h.runtime.getController(f.ListController);
    const control = h.runtime.getController(f.FiltersController).collections;
    const reportStarted = deferred<void>();
    const reportFinished = deferred<void>();
    const report = vi
      .spyOn(h.scope.get(ApplicationReportDispatcherInterface), 'report')
      .mockImplementation(async () => {
        reportStarted.resolve();
        await reportFinished.promise;
      });
    f.userDispose.mockImplementation(() => {
      throw new Error('user cleanup failed');
    });
    const disposal = h.runtime.dispose();
    await reportStarted.promise;
    try {
      expect(() => control.reset('rows')).toThrow();
      expect(() => old.rows.reset()).toThrow();
      expect(() => old.options.state.get('position')).toThrow();
    } finally {
      reportFinished.resolve();
      await disposal;
      report.mockRestore();
      await h.dispose();
    }
  });
});

describe('owned Collector creation and retained lifecycle', () => {
  it('keeps accepted pages and does not revive joined paging across retain/focus', async () => {
    const f = fixture();
    const h = f.host('module');
    const started = deferred<void>();
    const finish = deferred<number>();
    try {
      await h.load();
      f.readRows.mockImplementationOnce(async () => {
        started.resolve();
        return finish.promise;
      });
      const first = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const joined = h.runtime.revalidate({ controllerToken: f.ListController });
      await (h.runtime as ModuleRuntime).retain();
      await (h.runtime as ModuleRuntime).focus(new AbortController().signal);
      await Promise.all([first, joined]);
      expect(f.readRows).toHaveBeenCalledTimes(2);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
    } finally {
      finish.resolve(99);
      await h.dispose();
    }
  });

  it.each(['', null, undefined, 42])('rejects invalid declaration key %s before resolving a controller', (key) => {
    expect(() => InjectCollector(key as never)).toThrow();
  });

  it('rejects duplicate keys on two constructor slots without leaving an accepted controller', async () => {
    const f = fixture({ optionsKey: 'rows' });
    const h = f.host('module');
    try {
      await expect(h.load()).rejects.toThrow();
      expect(f.instances).toEqual([]);
      expect(f.readRows).not.toHaveBeenCalled();
      expect(f.readOptions).not.toHaveBeenCalled();
    } finally {
      await h.dispose();
    }
  });

  it('cleans up owned dependencies when a constructor throws, then permits the keys in a new runtime', async () => {
    let failConstruction = true;
    const f = fixture({ constructorError: () => (failConstruction ? new Error('constructor failed') : undefined) });
    const scope = new ApplicationScope();
    const first = f.host('module', scope);
    let second: ReturnType<typeof f.host> | undefined;
    try {
      await expect(first.load()).rejects.toThrow('constructor failed');
      const incomplete = f.instances[0];
      expect(incomplete).toBeDefined();
      expect(() => incomplete.rows.reset()).toThrow();
      expect(() => incomplete.options.reset()).toThrow();
      await first.runtime.dispose();
      failConstruction = false;
      second = f.host('module', scope);
      await second.load();
      expect(second.runtime.getController(f.ListController)).not.toBe(incomplete);
      expect(second.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
      second.runtime.getController(f.FiltersController).collections.reset('rows');
      await second.runtime.revalidate({ controllerToken: f.ListController });
      expect(second.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100, 101] });
    } finally {
      await first.runtime.dispose();
      await second?.runtime.dispose();
      await scope.disposeProviders();
      scope.dispose();
    }
  });

  it('preserves a retained module instance and its continuation until actual disposal', async () => {
    const f = fixture();
    const h = f.host('module');
    if (!(h.runtime instanceof ModuleRuntime)) throw new Error('Expected a module runtime.');
    try {
      await h.load();
      const controller = h.runtime.getController(f.ListController);
      await h.runtime.retain();
      await h.runtime.focus(new AbortController().signal);
      expect(h.runtime.getController(f.ListController)).toBe(controller);
      await h.runtime.revalidate({ controllerToken: f.ListController });
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1, 2], options: [100, 101] });
    } finally {
      await h.dispose();
    }
  });

  it('keeps owned collectors alive while retrying a failed initial widget loader', async () => {
    const f = fixture();
    const h = f.host('widget');
    try {
      f.readRows.mockRejectedValueOnce(new Error('initial unavailable'));
      await expect(h.load()).rejects.toThrow('initial unavailable');
      const controller = f.instances[0];
      const retry = h.runtime.getSnapshot().exception?.recovery.retry;
      if (!retry) throw new Error('Expected the real runtime retry capability.');
      await retry();
      expect(h.runtime.getController(f.ListController)).toBe(controller);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1], options: [100] });
      await h.runtime.revalidate({ controllerToken: f.ListController });
      expect(h.runtime.getLoaderData(f.ListController)).toEqual({ rows: [1, 2], options: [100, 101] });
    } finally {
      await h.dispose();
    }
  });
});
