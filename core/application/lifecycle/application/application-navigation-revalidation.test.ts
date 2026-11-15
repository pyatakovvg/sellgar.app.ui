import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestExecutorInterface } from '../../request/request-executor';
import { WidgetDefinition, configureWidgetRuntimeDefinition } from '../../../widget/declaration/widget';
import { WidgetRuntimeRegistry } from '../../../widget/runtime/widget-runtime-registry';
import { Controller } from '../../../controller/contract/controller';
import type { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import { LoaderTransactionService } from '../../../controller/runtime/loader-transaction';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { Policy } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import type {
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeLocationInterface,
  RouterBridgeRuntimeRetention,
} from '../../../router/bridge/router-bridge';
import { segments } from '../../../router/declaration/address';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { matchesNavigationRoute } from '../../../router/runtime/navigation-state';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { createNavigationRequest, type NavigationRequest } from '../../../router/service/navigation-request';
import { RoutePolicyInterface } from '../../../router/runtime/route-policy';
import { Provider, type ProviderInterface } from '../../../runtime/provider/provider';
import type { RuntimeExecution } from '../../../runtime/operation/runtime-execution';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';

import { Application } from './application.ts';

abstract class ListRoute {}
abstract class OtherRoute {}

const applications: Application<null>[] = [];

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });

  return { promise, resolve };
};

const createFixture = async (
  retention: RouterBridgeRuntimeRetention,
  otherRouteReady: Promise<void> = Promise.resolve(),
  redirectOther = false,
  throughExecutor = false,
) => {
  const events: string[] = [];
  const requestSignals: AbortSignal[] = [];
  const executions: RuntimeExecution[] = [];
  const read = vi.fn<() => Promise<number[]>>().mockResolvedValue([1]);
  const otherRouteStarted = deferred();
  const lifecycle = {
    initialize: vi.fn(),
    prepare: vi.fn(),
    activate: vi.fn(),
    revalidate: vi.fn(),
    dispose: vi.fn(),
  };

  @Controller()
  class ListController {
    constructor(
      @Inject(LoaderTransactionService) private readonly transactions: LoaderTransactionService,
      @Inject(RequestExecutorInterface) private readonly requests: RequestExecutorInterface,
    ) {}

    loader(): Promise<number[]> {
      const execution = this.transactions.requireCurrent().execution;
      if (!execution) throw new Error('Loader execution context is missing.');
      executions.push(execution);
      events.push('loader');
      return throughExecutor
        ? this.requests.run({ mode: 'sequential', queueKey: 'list' }, ({ signal }) => {
            requestSignals.push(signal);
            return read();
          })
        : read();
    }
  }

  class ListBindings implements BindingModuleInterface {
    register(registry: BindingRegistryInterface): void {
      registry.bind(ListController).toSelf().inSingletonScope();
    }
  }

  @UseBindings(ListBindings)
  class ListModule {}

  @UseBindings(ListBindings)
  class ListWidget extends WidgetDefinition {}
  configureWidgetRuntimeDefinition(ListWidget);

  @Provider()
  class ListProvider implements ProviderInterface {
    initialize(): void {
      lifecycle.initialize();
    }

    prepare(): void {
      lifecycle.prepare();
    }

    activate(): void {
      lifecycle.activate();
    }

    revalidate(): void {
      lifecycle.revalidate();
    }

    dispose(): void {
      lifecycle.dispose();
    }
  }

  @Policy()
  class DenyOtherRoute extends RoutePolicyInterface {
    execute(): PolicyResult {
      return { type: 'fail' };
    }
  }

  const router = new Router({
    routes: [
      new Route({ address: segments('list'), load: async () => ({}), providers: [ListProvider], token: ListRoute }),
      new Route({
        address: segments('other'),
        canMatch: redirectOther ? [DenyOtherRoute.configure().onFail(Router.redirectTo(ListRoute))] : [],
        load: async () => {
          otherRouteStarted.resolve();
          await otherRouteReady;
          return {};
        },
        token: OtherRoute,
      }),
    ],
  });

  class TestResolver implements ModuleExportResolverInterface<null> {
    resolve() {
      return createModuleRuntimeDefinition({ presentation: null, token: ListModule });
    }
  }

  class TestBridge implements RouterBridgeInterface {
    readonly runtimeRetention = retention;
    private context: RouterBridgeInitializeContextInterface | null = null;

    async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
      this.context = context;
      await context.navigate.to(ListRoute);
    }

    async back(): Promise<void> {
      await this.context!.back();
    }

    request(request: NavigationRequest): Promise<boolean> {
      return this.context!.navigateRequest(request);
    }

    restore(location: RouterBridgeLocationInterface): Promise<boolean> {
      return this.context!.restore(location, { blockersConfirmed: false });
    }

    commit(): void {
      events.push('bridge.commit');
    }

    dispose(): void {}
  }

  const bridge = new TestBridge();

  class TestApplication extends Application<null> {
    constructor() {
      super(bridge, new ApplicationConfig(), new TestResolver());
    }

    get navigate() {
      return this.getApplicationScope().get(NavigateServiceInterface);
    }

    get routes() {
      return this.getRouterRuntime().getActiveRouteRuntimes();
    }

    get navigation() {
      return this.getNavigationSnapshot();
    }

    protected configure(app: ApplicationConfiguratorInterface): void {
      app.router(router);
    }
  }

  const app = new TestApplication();
  applications.push(app);
  app.compose();
  await app.initialize();

  return {
    app,
    bridge,
    events,
    executions,
    lifecycle,
    ListController,
    ListWidget,
    otherRouteStarted,
    read,
    requestSignals,
  };
};

describe('Navigation and revalidation compatibility', () => {
  afterEach(async () => {
    for (const app of applications.splice(0)) {
      await app.dispose();
    }
  });

  describe.each(['release', 'retain'] as const)('%s retention', (retention) => {
    it('loads before initial commit and revalidates after reentry commit without replacing owners', async () => {
      const { app, events, executions, lifecycle, ListController } = await createFixture(retention);
      const route = app.routes[0]!;
      const module = route.getModuleRuntime();
      const controller = route.getController(ListController);

      expect(events).toEqual(['loader', 'bridge.commit']);
      const initial = executions[0]!;
      expect(initial.kind).toBe('load');
      expect(initial.navigation?.trigger).toBe('target');
      expect(initial.navigation?.source).toBe('internal');
      expect(initial.navigation?.parent).toBeNull();
      expect(matchesNavigationRoute(initial.navigation?.requested, ListRoute)).toBe(true);
      expect(Object.isFrozen(initial)).toBe(true);
      expect(Object.isFrozen(initial.navigation)).toBe(true);
      events.length = 0;

      await app.navigate.to(ListRoute);

      expect(events).toEqual(['bridge.commit', 'loader']);
      expect(app.routes[0]).toBe(route);
      expect(route.getModuleRuntime()).toBe(module);
      expect(route.getController(ListController)).toBe(controller);
      const reentry = executions[1]!;
      expect(reentry.kind).toBe('revalidation');
      expect(reentry.navigation?.trigger).toBe('target');
      expect(reentry.navigation?.id).not.toBe(initial.navigation?.id);
      expect(reentry.id).not.toBe(initial.id);
      expect(reentry.owner).toBe(initial.owner);
      expect(lifecycle.initialize).toHaveBeenCalledTimes(1);
      expect(lifecycle.prepare).toHaveBeenCalledTimes(1);
      expect(lifecycle.activate).toHaveBeenCalledTimes(1);
      expect(lifecycle.revalidate).toHaveBeenCalledTimes(1);
      expect(lifecycle.dispose).not.toHaveBeenCalled();
    });

    it('keeps initial load and skips an explicitly disabled revalidation', async () => {
      const { app, read } = await createFixture(retention);

      expect(read).toHaveBeenCalledTimes(1);
      await app.navigate.to(ListRoute, { query: { sort: 'asc' }, revalidate: false });

      expect(read).toHaveBeenCalledTimes(1);
      expect(app.navigation.navigation?.root.query).toEqual({ sort: 'asc' });
    });

    it('does not load again for an equivalent query or query with revalidation disabled', async () => {
      const { app, executions, read } = await createFixture(retention);
      const route = app.routes[0]!;

      await app.navigate.query({ sort: 'asc' });
      expect(read).toHaveBeenCalledTimes(2);
      expect(executions[1]!.navigation?.trigger).toBe('query');
      expect(executions[1]!.navigation?.requested.root.query).toEqual({ sort: 'asc' });

      await app.navigate.query({ sort: 'asc' });
      expect(read).toHaveBeenCalledTimes(2);

      await app.navigate.query({ sort: 'desc' }, { revalidate: false });
      expect(read).toHaveBeenCalledTimes(2);
      expect(app.navigation.navigation?.root.query).toEqual({ sort: 'desc' });
      expect(app.routes[0]).toBe(route);
    });

    it('skips query revalidation while a loader is busy and allows the next explicit refresh', async () => {
      const { app, read, ListController } = await createFixture(retention);
      const route = app.routes[0]!;
      const ready = deferred();
      const finish = deferred();
      const revalidate = vi.spyOn(route.getModuleRuntime(), 'revalidate');
      read.mockImplementationOnce(async () => {
        ready.resolve();
        await finish.promise;
        return [2];
      });
      const first = route.revalidate({ controllerToken: ListController });
      await ready.promise;
      const navigation = app.navigate.query({ sort: 'desc' });
      try {
        await vi.waitFor(() => expect(revalidate).toHaveBeenCalledTimes(2));
        finish.resolve();
        await Promise.all([first, navigation]);
        expect(app.navigation.navigation?.root.query).toEqual({ sort: 'desc' });
        expect(read).toHaveBeenCalledTimes(2);
        expect(route.getLoaderData(ListController)).toEqual([2]);
        read.mockResolvedValueOnce([3]);
        await route.revalidate();
        expect(read).toHaveBeenCalledTimes(3);
        expect(route.getLoaderData(ListController)).toEqual([3]);
      } finally {
        finish.resolve();
        await Promise.allSettled([first, navigation]);
      }
    });

    it('preserves accepted navigation and data after a postcommit loader failure and permits retry', async () => {
      const { app, executions, read, ListController } = await createFixture(retention);
      const route = app.routes[0]!;
      const controller = route.getController(ListController);
      const data = route.getLoaderData(ListController);
      const failure = new Error('Reentry loader failed.');
      read.mockRejectedValueOnce(failure);

      await expect(app.navigate.to(ListRoute, { query: { sort: 'asc' } })).rejects.toBe(failure);

      expect(app.navigation.navigation?.root.query).toEqual({ sort: 'asc' });
      expect(app.routes[0]).toBe(route);
      expect(route.getController(ListController)).toBe(controller);
      expect(route.getModuleRuntime().getSnapshot().phase).toBe('active');
      expect(route.getLoaderData(ListController)).toBe(data);
      expect(route.getRevalidateState().error).toBe(failure);
      expect(executions.at(-1)!.navigation?.trigger).toBe('target');

      read.mockResolvedValueOnce([2]);
      await route.revalidate();

      expect(route.getLoaderData(ListController)).toEqual([2]);
      expect(route.getRevalidateState().error).toBeUndefined();
      expect(executions.at(-1)!.kind).toBe('revalidation');
      expect(executions.at(-1)!.navigation).toBeNull();
    });

    it('permits targeted revalidation of the current owner while another navigation is pending', async () => {
      const ready = deferred();
      const { app, executions, read, ListController, otherRouteStarted } = await createFixture(
        retention,
        ready.promise,
      );
      const route = app.routes[0]!;
      const navigation = app.navigate.to(OtherRoute);

      try {
        await otherRouteStarted.promise;
        read.mockResolvedValueOnce([2]);
        await route.revalidate({ controllerToken: ListController });

        expect(app.routes[0]).toBe(route);
        expect(route.getLoaderData(ListController)).toEqual([2]);
        expect(executions.at(-1)!.navigation).toBeNull();
        expect(executions.at(-1)!.owner).toBe(executions[0]!.owner);
        expect(matchesNavigationRoute(app.navigation.pending, OtherRoute)).toBe(true);
        expect(matchesNavigationRoute(app.navigation.navigation, ListRoute)).toBe(true);
      } finally {
        ready.resolve();
        await navigation;
      }

      expect(matchesNavigationRoute(app.navigation.navigation, OtherRoute)).toBe(true);
      expect(executions.at(-1)!.owner).not.toBe(executions[0]!.owner);
      expect(executions.at(-1)!.navigation?.trigger).toBe('target');
    });

    it('distinguishes root navigation from a direct revalidation', async () => {
      const { app, executions } = await createFixture(retention);

      await app.navigate.root();
      expect(executions.at(-1)!.navigation?.trigger).toBe('root');

      await app.routes[0]!.revalidate();
      expect(executions.at(-1)!.kind).toBe('revalidation');
      expect(executions.at(-1)!.navigation).toBeNull();
    });

    it('preserves the original requested target as the parent of a policy redirect', async () => {
      const { app, executions } = await createFixture(retention, Promise.resolve(), true);

      await app.navigate.to(OtherRoute);

      const operation = executions.at(-1)!.navigation!;
      expect(operation.trigger).toBe('redirect');
      expect(matchesNavigationRoute(operation.requested, ListRoute)).toBe(true);
      expect(operation.parent?.trigger).toBe('target');
      expect(matchesNavigationRoute(operation.parent?.requested, OtherRoute)).toBe(true);
      expect(operation.id).not.toBe(operation.parent?.id);
    });

    it('preserves the distinct origins of an external request and a restored location', async () => {
      const { bridge, executions } = await createFixture(retention);

      await bridge.request(createNavigationRequest((navigate) => navigate.to(ListRoute)));

      expect(executions.at(-1)!.navigation?.trigger).toBe('bridge-request');
      expect(executions.at(-1)!.navigation?.source).toBe('external');

      await bridge.restore({ address: ['list'], nested: null, query: { sort: 'asc' }, state: undefined });

      expect(executions.at(-1)!.navigation?.trigger).toBe('restore');
      expect(executions.at(-1)!.navigation?.source).toBe('external');
      expect(executions.at(-1)!.navigation?.requested.root.query).toEqual({ sort: 'asc' });
    });
  });

  it('cancels a busy loader on browser history restore even when only the query changes', async () => {
    const f = await createFixture('retain', Promise.resolve(), false, true);
    const route = f.app.routes[0]!;
    const started = deferred();
    const finish = deferred();
    f.read.mockImplementationOnce(async () => {
      started.resolve();
      await finish.promise;
      return [99];
    });
    const refresh = route.revalidate();
    await started.promise;
    const signal = f.requestSignals.at(-1)!;
    try {
      f.read.mockResolvedValueOnce([3]);
      await f.bridge.restore({ address: ['list'], nested: null, query: { sort: 'asc' }, state: undefined });
      await refresh;
      expect(signal.aborted).toBe(true);
      expect(route.getRevalidateState().inProcess).toBe(false);
      expect(route.getLoaderData(f.ListController)).toEqual([3]);
      finish.resolve();
      await Promise.resolve();
      expect(route.getLoaderData(f.ListController)).toEqual([3]);
    } finally {
      finish.resolve();
      await refresh;
    }
  });

  describe.each(['release', 'retain'] as const)('request cancellation with %s retention', (retention) => {
    it.each(['target', 'back', 'forward'] as const)(
      'cancels the outgoing module on %s before the next loader needs its sequential key',
      async (direction) => {
        const f = await createFixture(retention, Promise.resolve(), false, true);
        if (direction === 'back') await f.app.navigate.to(OtherRoute);
        if (direction === 'forward') {
          await f.app.navigate.to(OtherRoute);
          await f.app.navigate.back();
        }
        const route = f.app.routes[0]!;
        const started = deferred();
        const finish = deferred();
        f.read.mockImplementationOnce(async () => {
          started.resolve();
          await finish.promise;
          return [99];
        });
        const refresh = route.revalidate({ controllerToken: f.ListController });
        await started.promise;
        const signal = f.requestSignals.at(-1)!;
        try {
          if (direction === 'back') await f.app.navigate.back();
          else if (direction === 'forward')
            await f.bridge.restore({ address: ['other'], nested: null, query: {}, state: undefined });
          else await f.app.navigate.to(OtherRoute);
          await refresh;
          expect(signal.aborted).toBe(true);
          expect(route.getRevalidateState().inProcess).toBe(false);
          const current = f.app.routes[0]!;
          f.read.mockResolvedValueOnce([3]);
          await current.revalidate();
          finish.resolve();
          await Promise.resolve();
          expect(current.getLoaderData(f.ListController)).toEqual([3]);
        } finally {
          finish.resolve();
          await refresh;
        }
      },
    );

    it.each(['initial', 'revalidation'] as const)(
      'cancels a widget %s on page exit and can load it after history back',
      async (mode) => {
        const f = await createFixture(retention, Promise.resolve(), false, true);
        const route = f.app.routes[0]!;
        const ownerScope = route.getModuleRuntime().getActiveModule().scope;
        const registry = ownerScope.get(WidgetRuntimeRegistry);
        const started = deferred();
        const finish = deferred();
        if (mode === 'initial')
          f.read.mockImplementationOnce(async () => {
            started.resolve();
            await finish.promise;
            return [99];
          });
        const lease = registry.attach({ ownerScope, token: f.ListWidget, props: {} });
        const widget = lease.runtime;
        let refresh: Promise<void> = Promise.resolve();
        if (mode === 'revalidation') {
          await vi.waitFor(() => expect(widget.getSnapshot().phase).toBe('ready'));
          f.read.mockImplementationOnce(async () => {
            started.resolve();
            await finish.promise;
            return [99];
          });
          refresh = widget.revalidate({ controllerToken: f.ListController });
        }
        await started.promise;
        const signal = f.requestSignals.at(-1)!;
        try {
          await f.app.navigate.to(OtherRoute);
          await refresh;
          expect(signal.aborted).toBe(true);
          expect(widget.getRevalidateState().inProcess).toBe(false);
          f.read.mockResolvedValueOnce([3]);
          await f.app.navigate.back();
          if (retention === 'retain') {
            await vi.waitFor(() => expect(widget.getSnapshot().phase).toBe('ready'));
            if (mode === 'revalidation') await widget.revalidate({ controllerToken: f.ListController });
            expect(widget.getLoaderData(f.ListController)).toEqual([3]);
            finish.resolve();
            await Promise.resolve();
            expect(widget.getLoaderData(f.ListController)).toEqual([3]);
          } else {
            expect(widget.getSnapshot().phase).toBe('disposed');
            expect(f.app.routes[0]!.getLoaderData(f.ListController)).toEqual([3]);
          }
        } finally {
          finish.resolve();
          lease.release();
          await refresh;
        }
      },
    );
  });

  it('restores a retained activation from history without another loader or controller instance', async () => {
    const { app, read, ListController } = await createFixture('retain');
    const route = app.routes[0]!;
    const controller = route.getController(ListController);

    await app.navigate.to(OtherRoute);
    expect(read).toHaveBeenCalledTimes(2);

    await app.navigate.back();

    expect(app.routes[0]).toBe(route);
    expect(route.getController(ListController)).toBe(controller);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('labels a released history activation that requires a new loader', async () => {
    const { app, executions } = await createFixture('release');

    await app.navigate.to(OtherRoute);
    await app.navigate.back();

    expect(executions.at(-1)!.kind).toBe('load');
    expect(executions.at(-1)!.navigation?.trigger).toBe('history');
    expect(executions.at(-1)!.navigation?.source).toBe('external');
  });
});
