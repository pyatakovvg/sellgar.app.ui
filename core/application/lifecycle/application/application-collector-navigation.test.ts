import { afterEach, describe, expect, it, vi } from 'vitest';

import { Controller } from '../../../controller/contract/controller';
import { InjectCollector } from '../../../collection/declaration/inject-collector';
import { CollectorServiceInterface } from '../../../collection/service/collector-service';
import { RouteQueryServiceInterface } from '../../../router/service/route-query-service';
import { Query } from '../../../router/declaration/query';

import { CollectorInterface } from '../../../collection/runtime/collector';
import type { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type {
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeLocationInterface,
  RouterBridgeRuntimeRetention,
} from '../../../router/bridge/router-bridge';
import { segments } from '../../../router/declaration/address';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { createNavigationRequest, type NavigationRequest } from '../../../router/service/navigation-request';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { RequestExecutorInterface } from '../../request/request-executor';

import { Application } from './application.ts';

@Query()
class SearchDto {
  search = '';
}

abstract class ListRoute {}
abstract class FrameRoute {}
abstract class OtherRoute {}

interface Page {
  readonly entries: number[];
  readonly following: number | null;
}

const applications: Application<null>[] = [];

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
};

const createFixture = async (retention: RouterBridgeRuntimeRetention = 'retain', frameReady = Promise.resolve()) => {
  const frameStarted = deferred();
  const read = vi.fn<(position?: number | null) => Promise<Page>>().mockResolvedValue({ entries: [1], following: 10 });
  const parentRead = vi
    .fn<(position?: number | null) => Promise<Page>>()
    .mockResolvedValue({ entries: [100], following: 10 });
  const frameRead = vi
    .fn<(position?: number | null) => Promise<Page>>()
    .mockResolvedValue({ entries: [1000], following: 10 });

  class Source {
    constructor(readonly read: (position?: number | null) => Promise<Page>) {}
  }

  @Controller()
  class ListController {
    constructor(
      @Inject(Source) private readonly source: Source,
      @InjectCollector('list') readonly collector: CollectorInterface<number, { position: number | null }>,
      @Inject(CollectorServiceInterface) readonly collections: CollectorServiceInterface,
      @Inject(RouteQueryServiceInterface) readonly query: RouteQueryServiceInterface,
    ) {}

    async changeSearch(search: string): Promise<void> {
      this.collections.reset('list');
      await this.query.set(SearchDto, { search });
    }

    loader(): Promise<number[]> {
      return this.collector.execute(async (collection, state) => {
        const position = state.get('position');
        if (position === null) return collection.append([]);
        const page = await this.source.read(position);
        state.set('position', page.following);
        return collection.append(page.entries);
      });
    }

    dispose(): void {}
  }

  const createModule = (read: typeof parentRead) => {
    class Bindings implements BindingModuleInterface {
      register(registry: BindingRegistryInterface): void {
        registry.bind(Source).toConstantValue(new Source(read));
        registry.bind(ListController).toSelf();
      }
    }

    @UseBindings(Bindings)
    class Module {}
    return Module;
  };

  const ListModule = createModule(read);
  const ParentModule = createModule(parentRead);
  const FrameModule = createModule(frameRead);
  const childRouter = new Router({
    routes: [
      new Route({
        address: segments('frame'),
        load: async () => {
          frameStarted.resolve();
          await frameReady;
          return { frame: true };
        },
        token: FrameRoute,
      }),
    ],
  });
  const router = new Router({
    routes: [
      new Route({
        defaultTo: ListRoute,
        load: async () => ({ parent: true }),
        routes: [
          new Route({
            address: segments('list'),
            load: async () => ({ list: true }),
            token: ListRoute,
            routing: [childRouter],
          }),
          new Route({ address: segments('other'), load: async () => ({}), token: OtherRoute }),
        ],
      }),
    ],
  });

  class Resolver implements ModuleExportResolverInterface<null> {
    resolve(exports: Record<string, unknown>) {
      return createModuleRuntimeDefinition({
        presentation: null,
        token: exports.parent ? ParentModule : exports.frame ? FrameModule : ListModule,
      });
    }
  }

  class Bridge implements RouterBridgeInterface {
    readonly runtimeRetention = retention;
    private context!: RouterBridgeInitializeContextInterface;

    async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
      this.context = context;
      await context.navigate.to(ListRoute);
    }

    request(request: NavigationRequest): Promise<boolean> {
      return this.context.navigateRequest(request);
    }

    restore(location: RouterBridgeLocationInterface): Promise<boolean> {
      return this.context.restore(location, { blockersConfirmed: false });
    }

    async back(): Promise<void> {
      await this.context.back();
    }
    commit(): void {}
    dispose(): void {}
  }

  const bridge = new Bridge();
  class TestApplication extends Application<null> {
    constructor() {
      super(bridge, new ApplicationConfig(), new Resolver());
    }
    get navigate() {
      return this.getApplicationScope().get(NavigateServiceInterface);
    }
    get routes() {
      return this.getRouterRuntime().getActiveRouteRuntimes();
    }
    get requests() {
      return this.getApplicationScope().get(RequestExecutorInterface);
    }
    protected configure(app: ApplicationConfiguratorInterface): void {
      app.router(router);
    }
  }

  const app = new TestApplication();
  applications.push(app);
  app.compose();
  await app.initialize();
  const list = app.routes[1]!;
  const parent = app.routes[0]!;
  const controller = list.getController(ListController);
  return { app, bridge, list, parent, controller, ListController, read, parentRead, frameRead, frameStarted };
};

describe('Collector navigation ownership', () => {
  afterEach(async () => {
    for (const app of applications.splice(0)) await app.dispose();
  });

  it.each(['sync', 'async'] as const)(
    'finishes application cleanup after a %s bridge disposal failure',
    async (kind) => {
      const { app, bridge, controller } = await createFixture();
      const error = new Error('bridge cleanup failed');
      const cleanup = vi.spyOn(controller, 'dispose');
      const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(bridge, 'dispose').mockImplementationOnce(() => {
        if (kind === 'sync') throw error;
        return Promise.reject(error);
      });

      try {
        await expect(app.dispose()).resolves.toBeUndefined();
        expect(cleanup).toHaveBeenCalledOnce();
        expect(app.lifecycle.phase).toBe('disposed');
        expect(report).toHaveBeenCalledWith(
          expect.objectContaining({ cause: error, disposition: 'cleanup.contained' }),
        );

        await app.dispose();
        expect(cleanup).toHaveBeenCalledOnce();
      } finally {
        report.mockRestore();
      }
    },
  );

  it('waits for the same cleanup when disposal is requested concurrently', async () => {
    const { app, bridge, controller } = await createFixture();
    const ready = deferred();
    const started = deferred();
    const cleanup = vi.spyOn(controller, 'dispose');
    vi.spyOn(bridge, 'dispose').mockImplementationOnce(() => {
      started.resolve();
      return ready.promise;
    });
    const finished = vi.fn();
    const first = app.dispose();
    const second = app.dispose().then(finished);
    await started.promise;

    expect(finished).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    ready.resolve();
    await Promise.all([first, second]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(app.lifecycle.phase).toBe('disposed');
  });

  it('shares disposal with a lifecycle subscriber requesting it reentrantly', async () => {
    const { app } = await createFixture();
    let repeated: Promise<void> | undefined;
    app.subscribe(() => {
      if (app.lifecycle.phase === 'disposing') repeated = app.dispose();
    });

    const disposal = app.dispose();
    expect(repeated).toBe(disposal);
    await disposal;
    expect(app.lifecycle.phase).toBe('disposed');
  });

  it('cancels application requests before dispose returns', async () => {
    const { app } = await createFixture();
    const ready = deferred();
    const started = deferred();
    let signal: AbortSignal | undefined;
    const request = app.requests
      .run(async (context) => {
        signal = context.signal;
        started.resolve();
        await ready.promise;
      })
      .catch(() => undefined);
    await started.promise;

    const disposal = app.dispose();
    expect(signal?.aborted).toBe(true);
    ready.resolve();
    await Promise.all([request, disposal]);
  });

  it.each([true, false])(
    'refreshes a changed parent query while opening a child (revalidate=%s)',
    async (revalidate) => {
      const { app, bridge, list, ListController, read, frameRead } = await createFixture();

      await bridge.restore({
        address: ['list'],
        nested: { address: ['frame'], query: {} },
        query: { sort: 'asc' },
        revalidate,
        state: undefined,
      });

      expect(frameRead).toHaveBeenCalledOnce();
      expect(read).toHaveBeenCalledTimes(revalidate ? 2 : 1);
      expect(app.routes[1]).toBe(list);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual(revalidate ? [1, 1] : [1]);
    },
  );

  it('refreshes a reused ancestor without repeating the initial load of its new sibling route', async () => {
    const { app, parent, read, parentRead } = await createFixture();

    await app.navigate.to(OtherRoute, { query: { sort: 'asc' } });

    expect(app.routes[0]).toBe(parent);
    expect(parentRead).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('restarts only the destination collection and preserves runtime and controller identity', async () => {
    const { app, list, parent, controller, ListController, read, parentRead } = await createFixture();
    read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await list.revalidate({ controllerToken: ListController });
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1, 2]);
    read.mockResolvedValueOnce({ entries: [3], following: 30 });

    await app.navigate.to(ListRoute, { query: { sort: 'asc' } });

    expect(app.routes[1]).toBe(list);
    expect(list.getController(ListController)).toBe(controller);
    expect(read).toHaveBeenLastCalledWith(undefined);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
    expect(parent.getModuleRuntime().getLoaderData(ListController)).toEqual([100, 100]);
    expect(parentRead).toHaveBeenLastCalledWith(10);
  });

  it('restarts a completed empty collection on the same destination', async () => {
    const { app, list, ListController, read } = await createFixture();
    read.mockResolvedValueOnce({ entries: [], following: null });
    await app.navigate.to(ListRoute);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([]);
    read.mockResolvedValueOnce({ entries: [3], following: null });
    await app.navigate.to(ListRoute);
    expect(read).toHaveBeenLastCalledWith(undefined);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
  });

  it('keeps the previous collection on failure and retries the new selection without navigation metadata', async () => {
    const { app, list, controller, ListController, read } = await createFixture();
    const previous = list.getModuleRuntime().getLoaderData(ListController);
    read.mockRejectedValueOnce(new Error('new selection failed'));
    await expect(app.navigate.to(ListRoute)).rejects.toThrow('new selection failed');
    expect(list.getModuleRuntime().getLoaderData(ListController)).toBe(previous);
    expect(controller.collector.state.get('position')).toBe(10);
    read.mockResolvedValueOnce({ entries: [3], following: 30 });
    await list.revalidate({ controllerToken: ListController });
    expect(read).toHaveBeenLastCalledWith(undefined);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
  });

  it('does not restart for ordinary query revalidation or a disabled navigation refresh', async () => {
    const { app, list, ListController, read } = await createFixture();
    read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await app.navigate.query({ panel: 'open' });
    expect(read).toHaveBeenLastCalledWith(10);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1, 2]);
    await app.navigate.to(ListRoute, { revalidate: false });
    expect(read).toHaveBeenCalledTimes(2);
    read.mockResolvedValueOnce({ entries: [3], following: 30 });
    await list.revalidate();
    expect(read).toHaveBeenLastCalledWith(20);
  });

  it('uses the same rule for root and explicit bridge requests', async () => {
    const { app, bridge, read } = await createFixture();
    await app.navigate.root();
    expect(read).toHaveBeenLastCalledWith(undefined);
    await bridge.request(createNavigationRequest((navigate) => navigate.to(ListRoute)));
    expect(read).toHaveBeenLastCalledWith(undefined);
  });

  it('preserves parent collections when opening, reentering and closing a child frame', async () => {
    const { app, list, ListController, read, parentRead, frameRead } = await createFixture();
    await app.navigate.to(FrameRoute);
    expect(read).toHaveBeenCalledTimes(1);
    expect(parentRead).toHaveBeenCalledTimes(1);
    frameRead.mockResolvedValueOnce({ entries: [1001], following: 20 });
    await app.navigate.to(FrameRoute);
    expect(frameRead).toHaveBeenLastCalledWith(undefined);
    expect(read).toHaveBeenLastCalledWith(10);
    expect(parentRead).toHaveBeenLastCalledWith(10);
    await app.navigate.back();
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1, 1]);
  });

  it('preserves a retained collection when restoring history instead of reentering explicitly', async () => {
    const { app, list, ListController, read } = await createFixture();
    read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await list.revalidate();
    await app.navigate.to(OtherRoute);
    const calls = read.mock.calls.length;
    await app.navigate.back();
    expect(read).toHaveBeenCalledTimes(calls);
    expect(app.routes[1]).toBe(list);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1, 2]);
  });

  it('does not restart the current selection while an uncommitted navigation is cancelled', async () => {
    const frameReady = deferred();
    const { app, list, ListController, read, frameStarted } = await createFixture('retain', frameReady.promise);
    const opening = app.navigate.to(FrameRoute);
    await frameStarted.promise;
    read.mockResolvedValueOnce({ entries: [2], following: 20 });
    await list.revalidate();
    expect(read).toHaveBeenLastCalledWith(10);

    const staying = app.navigate.to(ListRoute, { revalidate: false });
    frameReady.resolve();
    await opening;
    await staying;
    read.mockResolvedValueOnce({ entries: [3], following: 30 });
    await list.revalidate();
    expect(read).toHaveBeenLastCalledWith(20);
    expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1, 2, 3]);
  });

  it('replaces a pending append from the first page on explicit reentry without waiting for the old response', async () => {
    const { app, list, controller, ListController, read } = await createFixture();
    const started = deferred();
    const finish = deferred();
    read.mockImplementationOnce(async () => {
      started.resolve();
      await finish.promise;
      return { entries: [99], following: 99 };
    });
    try {
      const append = list.revalidate();
      await started.promise;
      read.mockResolvedValueOnce({ entries: [3], following: 30 });
      await app.navigate.to(ListRoute);
      expect(read).toHaveBeenCalledTimes(3);
      expect(read).toHaveBeenLastCalledWith(undefined);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
      finish.resolve();
      await append;
      expect(controller.collector.state.get('position')).toBe(30);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
    } finally {
      finish.resolve();
    }
  });

  it('loads the first page of a changed query when its previous page is still pending', async () => {
    const { list, controller, ListController, read } = await createFixture();
    const started = deferred();
    const finish = deferred();
    try {
      read.mockImplementationOnce(async () => {
        started.resolve();
        await finish.promise;
        return { entries: [99], following: 99 };
      });
      const paging = list.revalidate({ controllerToken: ListController });
      await started.promise;
      read.mockResolvedValueOnce({ entries: [3], following: null });
      const changed = controller.changeSearch('new');
      finish.resolve();
      await Promise.all([paging, changed]);
      expect(controller.query.get(SearchDto).search).toBe('new');
      expect(read).toHaveBeenCalledTimes(3);
      expect(read).toHaveBeenLastCalledWith(undefined);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
    } finally {
      finish.resolve();
    }
  });

  it('does not treat an unclassified external restore as an explicit reentry', async () => {
    const { bridge, read } = await createFixture();
    await bridge.restore({ address: ['list'], nested: null, query: {}, state: undefined });
    expect(read).toHaveBeenLastCalledWith(10);
  });

  it('accepts the latest search before obsolete paging and an earlier search respond', async () => {
    const { list, controller, ListController, read } = await createFixture();
    const pagingStarted = deferred();
    const finishPaging = deferred();
    const searchStarted = deferred();
    const finishSearch = deferred();
    const requests: { position: number | null | undefined; search: string }[] = [];
    const capture = (position: number | null | undefined) => {
      requests.push({ position, search: controller.query.get(SearchDto).search });
    };
    read.mockImplementationOnce(async (position) => {
      capture(position);
      pagingStarted.resolve();
      await finishPaging.promise;
      return { entries: [99], following: 99 };
    });
    read.mockImplementationOnce(async (position) => {
      capture(position);
      searchStarted.resolve();
      await finishSearch.promise;
      return { entries: [2], following: 20 };
    });
    read.mockImplementationOnce(async (position) => {
      capture(position);
      return { entries: [3], following: 30 };
    });
    try {
      const paging = list.revalidate({ controllerToken: ListController });
      await pagingStarted.promise;
      const earlier = controller.changeSearch('B');
      await searchStarted.promise;
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1]);
      const latest = controller.changeSearch('C');
      await latest;
      expect(controller.query.get(SearchDto).search).toBe('C');
      expect(requests).toEqual([
        { position: 10, search: '' },
        { position: undefined, search: 'B' },
        { position: undefined, search: 'C' },
      ]);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
      expect(controller.collector.state.get('position')).toBe(30);
      finishSearch.resolve();
      finishPaging.resolve();
      await Promise.all([paging, earlier]);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
      read.mockResolvedValueOnce({ entries: [4], following: null });
      await list.revalidate({ controllerToken: ListController });
      expect(read).toHaveBeenLastCalledWith(30);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3, 4]);
    } finally {
      finishSearch.resolve();
      finishPaging.resolve();
    }
  });

  it('loads only the latest search when query changes supersede each other before a replacement starts', async () => {
    const { list, controller, ListController, read } = await createFixture();
    const pagingStarted = deferred();
    const finishPaging = deferred();
    const searches: string[] = [];
    read.mockImplementationOnce(async () => {
      pagingStarted.resolve();
      await finishPaging.promise;
      return { entries: [99], following: 99 };
    });
    read.mockImplementation(async () => {
      searches.push(controller.query.get(SearchDto).search);
      return { entries: [3], following: null };
    });
    try {
      const paging = list.revalidate({ controllerToken: ListController });
      await pagingStarted.promise;
      const earlier = controller.changeSearch('B');
      const latest = controller.changeSearch('C');
      await Promise.all([earlier, latest]);
      expect(controller.query.get(SearchDto).search).toBe('C');
      expect(searches).toEqual(['C']);
      expect(read).toHaveBeenLastCalledWith(undefined);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
      finishPaging.resolve();
      await paging;
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
    } finally {
      finishPaging.resolve();
    }
  });

  it('retries the latest failed search from the first page after superseding an unfinished search', async () => {
    const { list, controller, ListController, read } = await createFixture();
    const earlierStarted = deferred();
    const finishEarlier = deferred();
    read.mockImplementationOnce(async () => {
      earlierStarted.resolve();
      await finishEarlier.promise;
      return { entries: [2], following: 20 };
    });
    try {
      const earlier = controller.changeSearch('B');
      await earlierStarted.promise;
      read.mockRejectedValueOnce(new Error('latest search failed'));
      await expect(controller.changeSearch('C')).rejects.toThrow('latest search failed');
      expect(controller.query.get(SearchDto).search).toBe('C');
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([1]);
      expect(controller.collector.state.get('position')).toBe(10);
      read.mockResolvedValueOnce({ entries: [3], following: null });
      await list.revalidate({ controllerToken: ListController });
      expect(read).toHaveBeenLastCalledWith(undefined);
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
      finishEarlier.resolve();
      await earlier;
      expect(list.getModuleRuntime().getLoaderData(ListController)).toEqual([3]);
    } finally {
      finishEarlier.resolve();
    }
  });
});
