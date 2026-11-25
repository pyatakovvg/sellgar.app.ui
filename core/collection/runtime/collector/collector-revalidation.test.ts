import { describe, expect, it, vi } from 'vitest';

import { Controller } from '../../../controller/contract/controller';
import { Inject } from '../../../di/injection/decorators';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import { ModuleRuntime } from '../../../module/runtime/module-runtime';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { Feature } from '../../../application/feature/application-feature';
import { ApplicationFeaturesRuntime } from '../../../application/feature/application-features-runtime';
import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
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

const fixture = () => {
  const readRows = vi.fn(async (position: number | undefined): Promise<number> => (position ?? 0) + 1);
  const readOptions = vi.fn(async (position: number | undefined): Promise<number> => (position ?? 99) + 1);

  @Controller()
  class ListController {
    constructor(@InjectCollector('rows') readonly rows: CollectorInterface<number, Position>) {}

    async loader() {
      return this.rows.execute(async (collection, state) => {
        const value = await readRows(state.get('position'));
        state.set('position', value);
        return collection.append([value]);
      });
    }
  }

  @Controller()
  class FiltersController {
    constructor(@Inject(CollectorServiceInterface) readonly collections: CollectorServiceInterface) {}
  }

  @Controller()
  class OptionsController {
    constructor(@InjectCollector('options') readonly options: CollectorInterface<number, Position>) {}
    async loader() {
      return this.options.execute(async (collection, state) => {
        const value = await readOptions(state.get('position'));
        state.set('position', value);
        return collection.append([value]);
      });
    }
  }
  class Bindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(ListController).toSelf();
      registry.bind(OptionsController).toSelf();
      registry.bind(FiltersController).toSelf();
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
    OptionsController,
    FiltersController,
    readRows,
    readOptions,
    host,
  };
};

describe.each(['module', 'widget', 'application'] as const)('Crossed targeted tasks in %s', (kind) => {
  it('retries invalidated target without appending an already committed peer a second time', async () => {
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
      const a = h.runtime.revalidate({ controllerToken: f.ListController });
      await started.promise;
      const b = h.runtime.revalidate({ controllerToken: f.OptionsController });
      h.runtime.getController(f.FiltersController).collections.reset('rows');
      f.readRows.mockResolvedValueOnce(3);
      const all = h.runtime.revalidate();
      finish.resolve(99);
      await Promise.all([a, b, all]);
      expect(h.runtime.getLoaderData(f.ListController)).toEqual([3]);
      expect(f.readRows).toHaveBeenCalledTimes(3);
      expect(f.readRows).toHaveBeenLastCalledWith(undefined);
      expect(h.runtime.getLoaderData(f.OptionsController)).toEqual([100, 101]);
      expect(f.readOptions).toHaveBeenCalledTimes(2);
    } finally {
      finish.resolve(99);
      await h.dispose();
    }
  });
});
