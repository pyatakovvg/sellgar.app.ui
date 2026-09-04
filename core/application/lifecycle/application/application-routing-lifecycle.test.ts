import { afterEach, describe, expect, it, vi } from 'vitest';

import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { Policy } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeRuntimeRetention,
} from '../../../router/bridge/router-bridge';
import { param, segments } from '../../../router/declaration/address';
import { getRouteDefinition, Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import type { NavigationState } from '../../../router/runtime/navigation-state';
import { RoutePolicyInterface } from '../../../router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../router/runtime/route-runtime-context';
import type { RouteRuntime } from '../../../router/runtime/route-runtime';
import { createScopedNavigate, NavigateServiceInterface } from '../../../router/service/navigate-service';
import { Provider, ProviderInterface } from '../../../runtime/provider/provider';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';

import { Application } from './application.ts';

abstract class WorkspaceRoute {
  abstract readonly workspaceId: string;
}

abstract class FirstRoute {}
abstract class SecondRoute {}
abstract class OtherRoute {}
abstract class SlowRoute {}
abstract class BoundaryRoute {}
abstract class IndexParentRoute {}
abstract class IndexRoute {}
abstract class DefaultParentRoute {}
abstract class DefaultRoute {}
abstract class FirstAvailableParentRoute {}
abstract class DeniedRoute {}
abstract class AvailableRoute {}
abstract class RevalidationParentRoute {}
abstract class RevalidationLeafRoute {}
abstract class QueryModuleRoute {}
abstract class QueryFrameRoute {}
abstract class ParentScreenRoute {}
abstract class ChildScreenRoute {}
abstract class ProductsRoute {}
abstract class ProductRoute {
  abstract readonly productId: string;
}

class TestModule {}

@Provider()
class RevalidationProvider implements ProviderInterface {
  static revalidations = 0;

  revalidate(): void {
    RevalidationProvider.revalidations += 1;
  }

  dispose(): void {}
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  reject(reason?: unknown): void;
  resolve(value: TValue): void;
}

class TestModuleExportResolver implements ModuleExportResolverInterface<null> {
  resolve(moduleExports: Readonly<Record<string, unknown>>) {
    const token = (moduleExports['module'] as typeof TestModule | undefined) ?? TestModule;

    return createModuleRuntimeDefinition({ presentation: null, token });
  }
}

type InitialNavigation = (navigate: NavigateServiceInterface) => Promise<void>;

class TestRouterBridge implements RouterBridgeInterface {
  readonly runtimeRetention: RouterBridgeRuntimeRetention;
  private context: RouterBridgeInitializeContextInterface | null = null;
  lastBackResult: boolean | null = null;

  constructor(
    private readonly initialNavigation: InitialNavigation,
    runtimeRetention: RouterBridgeRuntimeRetention,
  ) {
    this.runtimeRetention = runtimeRetention;
  }

  async back(): Promise<void> {
    this.lastBackResult = (await this.context?.back()) ?? false;
  }

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    this.context = context;
    await this.initialNavigation(context.navigate);
  }

  commit(_navigation: NavigationState, _context: RouterBridgeCommitContextInterface): void {}

  dispose(): void {}
}

class TestApplication extends Application<null> {
  readonly bridge: TestRouterBridge;

  constructor(
    private readonly router: Router,
    initialNavigation: InitialNavigation,
    runtimeRetention: RouterBridgeRuntimeRetention,
  ) {
    const bridge = new TestRouterBridge(initialNavigation, runtimeRetention);

    super(bridge, new ApplicationConfig(), new TestModuleExportResolver());
    this.bridge = bridge;
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get activeRoutes(): readonly RouteRuntime<null>[] {
    return this.getRouterRuntime().getActiveRouteRuntimes();
  }

  get pendingRoutes(): readonly RouteRuntime<null>[] {
    return this.getRouterRuntime().getPendingRouteRuntimes();
  }

  get routerPhase(): string {
    return this.getRouterRuntime().getSnapshot().phase;
  }

  get runtimeEntries() {
    return this.getRouterRuntimeEntries();
  }

  get historyEntries() {
    return this.getRouterHistoryEntries();
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(this.router);
  }
}

@Policy()
class DenyPolicy extends RoutePolicyInterface {
  execute(_context: RouteRuntimeContextInterface): PolicyResult {
    return { reason: 'test-denied', type: 'fail' };
  }
}

describe('Application routing lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a duplicate Route class token during application composition', async () => {
    const router = new Router({
      routes: [createModuleRoute(FirstRoute, 'first'), createModuleRoute(FirstRoute, 'duplicate')],
    });
    const app = new TestApplication(router, async () => undefined);

    expect(() => app.compose()).toThrow('Route token зарегистрирован повторно: FirstRoute');

    await app.dispose();
  });

  it('allows a screen Route to own child screen Routes without an artificial index token', async () => {
    const router = new Router({
      routes: [
        new Route({
          address: segments('parent'),
          load: loadTestModule,
          routes: [createModuleRoute(ChildScreenRoute, 'child')],
          token: ParentScreenRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(ParentScreenRoute));
    const parentRuntime = app.activeRoutes[0]!;

    expect(app.activeRoutes).toEqual([parentRuntime]);

    await app.navigate.through(ParentScreenRoute).to(ChildScreenRoute);

    expect(app.activeRoutes[0]).toBe(parentRuntime);
    expect(app.activeRoutes).toHaveLength(2);

    await app.dispose();
  });

  it('retains a replaced sibling and restores it on Back without creating another runtime', async () => {
    const app = await createApplication(createBranchRouter(), (navigate) =>
      navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(FirstRoute),
    );
    const [workspaceRuntime, firstRuntime] = app.activeRoutes;

    await app.navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(SecondRoute);

    const [reusedWorkspaceRuntime, secondRuntime] = app.activeRoutes;

    expect(reusedWorkspaceRuntime).toBe(workspaceRuntime);
    expect(firstRuntime!.getSnapshot().phase).toBe('retained');
    expect(secondRuntime!.getSnapshot().phase).toBe('active');

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([workspaceRuntime, firstRuntime]);
    expect(firstRuntime!.getSnapshot().phase).toBe('active');
    expect(secondRuntime!.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('restarts a released ModuleRuntime on Back when the renderer does not retain runtimes', async () => {
    const firstLoad = vi.fn(loadTestModule);
    const secondLoad = vi.fn(loadTestModule);
    const router = new Router({
      routes: [
        new Route({ address: segments('first'), load: firstLoad, token: FirstRoute }),
        new Route({ address: segments('second'), load: secondLoad, token: SecondRoute }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(FirstRoute), 'release');
    const firstRuntime = app.activeRoutes[0]!;

    await app.navigate.to(SecondRoute);
    const secondRuntime = app.activeRoutes[0]!;

    expect(firstRuntime.getSnapshot().phase).toBe('disposed');

    await app.navigate.back();

    expect(app.activeRoutes[0]).not.toBe(firstRuntime);
    expect(app.activeRoutes[0]!.getSnapshot().phase).toBe('active');
    expect(secondRuntime.getSnapshot().phase).toBe('disposed');
    expect(firstLoad).toHaveBeenCalledTimes(2);
    expect(secondLoad).toHaveBeenCalledOnce();

    await app.dispose();
  });

  it('keeps the active owner ModuleRuntime while a released frame is opened and closed', async () => {
    const moduleLoad = vi.fn(loadTestModule);
    const frameLoad = vi.fn(loadTestModule);
    const frameRouter = new Router({
      routes: [new Route({ address: segments('frame'), load: frameLoad, token: QueryFrameRoute })],
    });
    const router = new Router({
      routes: [
        new Route({
          address: segments('module'),
          load: moduleLoad,
          routing: [frameRouter],
          token: QueryModuleRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(QueryModuleRoute), 'release');
    const moduleRuntime = app.activeRoutes[0]!;

    await app.navigate.through(QueryModuleRoute).to(QueryFrameRoute);
    const frameRuntime = app.activeRoutes[1]!;

    expect(app.activeRoutes[0]).toBe(moduleRuntime);

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([moduleRuntime]);
    expect(moduleRuntime.getSnapshot().phase).toBe('active');
    expect(frameRuntime.getSnapshot().phase).toBe('disposed');
    expect(moduleLoad).toHaveBeenCalledOnce();
    expect(frameLoad).toHaveBeenCalledOnce();

    await app.dispose();
  });

  it('keeps parameterized activations under one Route identity and restores the previous params on Back', async () => {
    const app = await createApplication(createBranchRouter(), (navigate) =>
      navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(FirstRoute),
    );
    const [workspaceRuntime, firstRuntime] = app.activeRoutes;

    await app.navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-2' } }).to(SecondRoute);

    const nextWorkspaceRuntime = app.activeRoutes[0]!;

    expect(nextWorkspaceRuntime).not.toBe(workspaceRuntime);
    expect(workspaceRuntime!.getSnapshot().phase).toBe('retained');
    expect(firstRuntime!.getSnapshot().phase).toBe('retained');
    expect(nextWorkspaceRuntime.getParams()).toEqual({ workspaceId: 'workspace-2' });

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([workspaceRuntime, firstRuntime]);
    expect(workspaceRuntime!.getSnapshot().phase).toBe('active');
    expect(nextWorkspaceRuntime.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('reuses a retained activation on forward navigation and keeps chronological Back history', async () => {
    const firstLoad = vi.fn(loadTestModule);
    const secondLoad = vi.fn(loadTestModule);
    const router = new Router({
      routes: [
        new Route({ address: segments('first'), load: firstLoad, token: FirstRoute }),
        new Route({ address: segments('second'), load: secondLoad, token: SecondRoute }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(FirstRoute));
    const firstRuntime = app.activeRoutes[0]!;

    await app.navigate.to(SecondRoute);
    const secondRuntime = app.activeRoutes[0]!;
    await app.navigate.to(FirstRoute);

    expect(app.activeRoutes).toEqual([firstRuntime]);
    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).toHaveBeenCalledOnce();
    expect(app.runtimeEntries.map(({ key, phase }) => ({ key, phase }))).toEqual([
      { key: 'activation:1', phase: 'focused' },
      { key: 'activation:2', phase: 'retained' },
    ]);
    expect(app.historyEntries.map(({ activation, key, phase }) => ({ activation: activation.id, key, phase }))).toEqual(
      [
        { activation: 'activation:1', key: 'navigation:1', phase: 'retained' },
        { activation: 'activation:2', key: 'navigation:2', phase: 'retained' },
        { activation: 'activation:1', key: 'navigation:3', phase: 'focused' },
      ],
    );

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([secondRuntime]);
    expect(firstRuntime.getSnapshot().phase).toBe('retained');
    expect(app.runtimeEntries.map(({ key, phase }) => ({ key, phase }))).toEqual([
      { key: 'activation:1', phase: 'retained' },
      { key: 'activation:2', phase: 'focused' },
    ]);
    expect(app.historyEntries.map(({ activation, key, phase }) => ({ activation: activation.id, key, phase }))).toEqual(
      [
        { activation: 'activation:1', key: 'navigation:1', phase: 'retained' },
        { activation: 'activation:2', key: 'navigation:2', phase: 'focused' },
      ],
    );

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([firstRuntime]);
    expect(firstRuntime.getSnapshot().phase).toBe('active');
    expect(secondRuntime.getSnapshot().phase).toBe('disposed');
    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).toHaveBeenCalledOnce();
    expect(app.runtimeEntries.map(({ key, phase }) => ({ key, phase }))).toEqual([
      { key: 'activation:1', phase: 'focused' },
    ]);

    await app.dispose();
  });

  it('retains and restores a nested Router activation without reloading its owner or screen', async () => {
    const moduleLoad = vi.fn(loadTestModule);
    const frameLoad = vi.fn(loadTestModule);
    const frameRouter = new Router({
      routes: [new Route({ address: segments('frame'), load: frameLoad, token: QueryFrameRoute })],
    });
    const router = new Router({
      routes: [
        new Route({
          address: segments('module'),
          load: moduleLoad,
          routing: [frameRouter],
          token: QueryModuleRoute,
        }),
        createModuleRoute(OtherRoute, 'other'),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(QueryModuleRoute));
    const moduleRuntime = app.activeRoutes[0]!;

    await app.navigate.through(QueryModuleRoute).to(QueryFrameRoute);
    const frameRuntime = app.activeRoutes[1]!;
    await app.navigate.to(OtherRoute);

    expect(moduleRuntime.getSnapshot().phase).toBe('retained');
    expect(frameRuntime.getSnapshot().phase).toBe('retained');

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([moduleRuntime, frameRuntime]);
    expect(moduleRuntime.getSnapshot().phase).toBe('active');
    expect(frameRuntime.getSnapshot().phase).toBe('active');
    expect(moduleLoad).toHaveBeenCalledOnce();
    expect(frameLoad).toHaveBeenCalledOnce();

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([moduleRuntime]);
    expect(frameRuntime.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('closes an opened nested Router by removing its history entry and restoring its owner', async () => {
    const moduleLoad = vi.fn(loadTestModule);
    const frameLoad = vi.fn(loadTestModule);
    const frameRouter = new Router({
      routes: [new Route({ address: segments('frame'), load: frameLoad, token: QueryFrameRoute })],
    });
    const router = new Router({
      routes: [
        new Route({
          address: segments('module'),
          load: moduleLoad,
          routing: [frameRouter],
          token: QueryModuleRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(QueryModuleRoute));
    const moduleRuntime = app.activeRoutes[0]!;

    await app.navigate.through(QueryModuleRoute).to(QueryFrameRoute);
    const frameRuntime = app.activeRoutes[1]!;
    const frameNavigate = createScopedNavigate(app.navigate, frameRouter);

    await frameNavigate.close();

    expect(app.bridge.lastBackResult).toBeNull();
    expect(app.activeRoutes).toEqual([moduleRuntime]);
    expect(app.runtimeEntries).toHaveLength(1);
    expect(moduleRuntime.getSnapshot().phase).toBe('active');
    expect(frameRuntime.getSnapshot().phase).toBe('disposed');
    expect(moduleLoad).toHaveBeenCalledOnce();
    expect(frameLoad).toHaveBeenCalledOnce();

    await app.dispose();
  });

  it('closes a directly opened nested Router by replacing only its current history entry', async () => {
    const moduleLoad = vi.fn(loadTestModule);
    const frameLoad = vi.fn(loadTestModule);
    const frameRouter = new Router({
      routes: [new Route({ address: segments('frame'), load: frameLoad, token: QueryFrameRoute })],
    });
    const router = new Router({
      routes: [
        new Route({
          address: segments('module'),
          load: moduleLoad,
          routing: [frameRouter],
          token: QueryModuleRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.through(QueryModuleRoute).to(QueryFrameRoute));
    const [moduleRuntime, frameRuntime] = app.activeRoutes;
    const frameNavigate = createScopedNavigate(app.navigate, frameRouter);

    await frameNavigate.close();

    expect(app.bridge.lastBackResult).toBeNull();
    expect(app.activeRoutes).toEqual([moduleRuntime]);
    expect(app.runtimeEntries).toHaveLength(1);
    expect(moduleRuntime!.getSnapshot().phase).toBe('active');
    expect(frameRuntime!.getSnapshot().phase).toBe('disposed');
    expect(moduleLoad).toHaveBeenCalledOnce();
    expect(frameLoad).toHaveBeenCalledOnce();

    await app.dispose();
  });

  it('replaces only the current history entry when navigation targets a different activation', async () => {
    const app = await createApplication(createBranchRouter(), (navigate) =>
      navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(FirstRoute),
    );
    const [workspaceRuntime, firstRuntime] = app.activeRoutes;

    await app.navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(SecondRoute);
    const secondRuntime = app.activeRoutes[1]!;
    await app.navigate.to(OtherRoute, { replace: true });

    expect(workspaceRuntime!.getSnapshot().phase).toBe('retained');
    expect(firstRuntime!.getSnapshot().phase).toBe('retained');
    expect(secondRuntime.getSnapshot().phase).toBe('disposed');
    expect(getRouteDefinition(app.activeRoutes[0]!.route).token).toBe(OtherRoute);

    const otherRuntime = app.activeRoutes[0]!;
    await app.navigate.back();

    expect(app.activeRoutes).toEqual([workspaceRuntime, firstRuntime]);
    expect(workspaceRuntime!.getSnapshot().phase).toBe('active');
    expect(firstRuntime!.getSnapshot().phase).toBe('active');
    expect(otherRuntime.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('restores the previous screen after replacing a parameterized screen activation', async () => {
    const router = new Router({
      routes: [
        createModuleRoute(ProductsRoute, 'products'),
        new Route({
          address: segments('products', param('productId')),
          load: loadTestModule,
          token: ProductRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(ProductsRoute));
    const productsRuntime = app.activeRoutes[0]!;

    await app.navigate.to(ProductRoute, { params: { productId: 'product-45' } });
    const product45Runtime = app.activeRoutes[0]!;
    await app.navigate.to(ProductRoute, {
      params: { productId: 'product-84' },
      replace: true,
    });
    const product84Runtime = app.activeRoutes[0]!;

    expect(productsRuntime.getSnapshot().phase).toBe('retained');
    expect(product45Runtime.getSnapshot().phase).toBe('disposed');
    expect(product84Runtime.getParams()).toEqual({ productId: 'product-84' });

    await app.navigate.back();

    expect(app.activeRoutes).toEqual([productsRuntime]);
    expect(productsRuntime.getSnapshot().phase).toBe('active');
    expect(product84Runtime.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('restarts the previous screen after replace when the renderer releases inactive runtimes', async () => {
    const productsLoad = vi.fn(loadTestModule);
    const productLoad = vi.fn(loadTestModule);
    const router = new Router({
      routes: [
        new Route({ address: segments('products'), load: productsLoad, token: ProductsRoute }),
        new Route({
          address: segments('products', param('productId')),
          load: productLoad,
          token: ProductRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(ProductsRoute), 'release');
    const initialProductsRuntime = app.activeRoutes[0]!;

    await app.navigate.to(ProductRoute, { params: { productId: 'product-45' } });
    await app.navigate.to(ProductRoute, {
      params: { productId: 'product-84' },
      replace: true,
    });
    const product84Runtime = app.activeRoutes[0]!;

    expect(initialProductsRuntime.getSnapshot().phase).toBe('disposed');

    await app.navigate.back();

    expect(getRouteDefinition(app.activeRoutes[0]!.route).token).toBe(ProductsRoute);
    expect(app.activeRoutes[0]).not.toBe(initialProductsRuntime);
    expect(product84Runtime.getSnapshot().phase).toBe('disposed');
    expect(productsLoad).toHaveBeenCalledTimes(2);
    expect(productLoad).toHaveBeenCalledTimes(2);

    await app.dispose();
  });

  it('does not add Back entries for repeated activation or query-only navigation', async () => {
    const app = await createApplication(createScopedQueryRouter(), (navigate) =>
      navigate.through(QueryModuleRoute).to(QueryFrameRoute),
    );
    const routes = app.activeRoutes;

    await app.navigate.through(QueryModuleRoute).to(QueryFrameRoute);
    await app.navigate.query({ page: 2 });
    await app.navigate.back();

    expect(app.bridge.lastBackResult).toBe(false);
    expect(app.activeRoutes).toEqual(routes);

    await app.dispose();
  });

  it('discards a superseded route after its late module load completes', async () => {
    const deferred = createDeferred<Record<string, unknown>>();
    const slowLoad = vi.fn(() => deferred.promise);
    const app = await createApplication(createBranchRouter(slowLoad), (navigate) =>
      navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(FirstRoute),
    );
    const committedRoutes = app.activeRoutes;

    const slowNavigation = app.navigate
      .through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } })
      .to(SlowRoute);

    await vi.waitFor(() => expect(slowLoad).toHaveBeenCalledOnce());
    const slowRuntime = app.pendingRoutes.at(-1)!;

    const replacementNavigation = app.navigate
      .through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } })
      .to(FirstRoute);

    deferred.resolve({ module: TestModule });
    await Promise.all([slowNavigation, replacementNavigation]);

    expect(app.activeRoutes).toEqual(committedRoutes);
    expect(slowRuntime.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('owns a Router policy boundary on the Router runtime', async () => {
    const router = new Router({
      canActivate: [DenyPolicy],
      routes: [createModuleRoute(BoundaryRoute, 'boundary')],
    });
    const app = await createApplication(router, (navigate) => navigate.to(BoundaryRoute));

    expect(app.routerPhase).toBe('forbidden');
    expect(app.activeRoutes).toHaveLength(0);

    await app.dispose();
  });

  it('owns a Route policy boundary on the denied Route runtime', async () => {
    const router = new Router({
      routes: [
        new Route({
          address: segments('boundary'),
          canActivate: [DenyPolicy],
          load: loadTestModule,
          token: BoundaryRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(BoundaryRoute));

    expect(app.routerPhase).toBe('active');
    expect(app.activeRoutes).toHaveLength(1);
    expect(app.activeRoutes[0]!.getSnapshot().phase).toBe('forbidden');

    await app.dispose();
  });

  it('owns a module activation failure on the loading Route runtime', async () => {
    const error = new Error('Module load failed.');
    vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const router = new Router({
      routes: [
        new Route({
          address: segments('boundary'),
          load: async () => Promise.reject(error),
          token: BoundaryRoute,
        }),
      ],
    });
    const app = await createApplication(router, (navigate) => navigate.to(BoundaryRoute));

    expect(app.routerPhase).toBe('active');
    expect(app.activeRoutes).toHaveLength(1);
    expect(app.activeRoutes[0]!.getSnapshot()).toEqual({ error, phase: 'failed' });

    await app.dispose();
  });

  it('resolves index, explicit default and first available routes deterministically', async () => {
    const indexApp = await createApplication(createIndexRouter(), (navigate) => navigate.to(IndexParentRoute));

    expect(indexApp.activeRoutes.map((runtime) => runtime.route)).toHaveLength(2);
    expect(indexApp.activeRoutes.at(-1)!.getModuleRuntime().getSnapshot().phase).toBe('active');
    await indexApp.dispose();

    const defaultApp = await createApplication(createDefaultRouter(), (navigate) => navigate.to(DefaultParentRoute));

    expect(defaultApp.activeRoutes).toHaveLength(2);
    expect(getRouteDefinition(defaultApp.activeRoutes.at(-1)!.route).token).toBe(DefaultRoute);
    await defaultApp.dispose();

    const firstAvailableApp = await createApplication(createFirstAvailableRouter(), (navigate) =>
      navigate.to(FirstAvailableParentRoute),
    );

    expect(firstAvailableApp.activeRoutes).toHaveLength(2);
    expect(firstAvailableApp.activeRoutes.at(-1)!.getSnapshot().phase).toBe('active');
    expect(getRouteDefinition(firstAvailableApp.activeRoutes.at(-1)!.route).token).toBe(AvailableRoute);
    await firstAvailableApp.dispose();
  });

  it('keeps a Module render failure inside its ModuleRuntime', async () => {
    const app = await createApplication(createBranchRouter(), (navigate) =>
      navigate.through(WorkspaceRoute, { params: { workspaceId: 'workspace-1' } }).to(FirstRoute),
    );
    const routeRuntime = app.activeRoutes.at(-1)!;
    const moduleRuntime = routeRuntime.getModuleRuntime();
    const error = new Error('module render failed');

    await moduleRuntime.failRender(error);

    expect(moduleRuntime.getSnapshot()).toEqual({ error, phase: 'failed' });
    expect(routeRuntime.getSnapshot()).toEqual({ error: null, phase: 'active' });
    expect(app.routerPhase).toBe('active');

    await app.dispose();
  });

  it('moves the Application to failed and releases its Router branch after an application render failure', async () => {
    const app = await createApplication(createBranchRouter(), (navigate) => navigate.to(OtherRoute));
    const routeRuntime = app.activeRoutes[0]!;
    const error = new Error('application render failed');

    await app.failRender(error);

    expect(app.lifecycle).toEqual({ error, phase: 'failed' });
    expect(app.routerPhase).toBe('disposed');
    expect(routeRuntime.getSnapshot().phase).toBe('disposed');

    await app.dispose();
  });

  it('revalidates the complete active branch for repeated navigation from every navigation scope', async () => {
    RevalidationProvider.revalidations = 0;
    const app = await createApplication(createRevalidationRouter(), (navigate) =>
      navigate.through(RevalidationParentRoute).to(RevalidationLeafRoute),
    );
    const [parentRuntime, leafRuntime] = app.activeRoutes;
    const navigateToActiveLeaf = (navigate: NavigateServiceInterface): Promise<void> =>
      navigate.through(RevalidationParentRoute).to(RevalidationLeafRoute);
    let leafRevision = leafRuntime!.getRevalidateRevision();

    await navigateToActiveLeaf(app.navigate);

    expect(app.activeRoutes).toEqual([parentRuntime, leafRuntime]);
    expect(RevalidationProvider.revalidations).toBe(1);
    expect(leafRuntime!.getRevalidateRevision()).toBeGreaterThan(leafRevision);
    leafRevision = leafRuntime!.getRevalidateRevision();

    await navigateToActiveLeaf(parentRuntime!.getRouteScope().get(NavigateServiceInterface));

    expect(app.activeRoutes).toEqual([parentRuntime, leafRuntime]);
    expect(RevalidationProvider.revalidations).toBe(2);
    expect(leafRuntime!.getRevalidateRevision()).toBeGreaterThan(leafRevision);
    leafRevision = leafRuntime!.getRevalidateRevision();

    await navigateToActiveLeaf(leafRuntime!.getRouteScope().get(NavigateServiceInterface));

    expect(app.activeRoutes).toEqual([parentRuntime, leafRuntime]);
    expect(RevalidationProvider.revalidations).toBe(3);
    expect(leafRuntime!.getRevalidateRevision()).toBeGreaterThan(leafRevision);

    await app.dispose();
  });

  it('revalidates only the Router that owns the changed query', async () => {
    const app = await createApplication(createScopedQueryRouter(), (navigate) =>
      navigate.through(QueryModuleRoute).to(QueryFrameRoute),
    );
    const [moduleRuntime, frameRuntime] = app.activeRoutes;
    const moduleRevision = moduleRuntime!.getRevalidateRevision();
    const frameRevision = frameRuntime!.getRevalidateRevision();

    await app.navigate.query({ page: 2 });

    expect(moduleRuntime!.getRevalidateRevision()).toBeGreaterThan(moduleRevision);
    expect(frameRuntime!.getRevalidateRevision()).toBe(frameRevision);

    const nextModuleRevision = moduleRuntime!.getRevalidateRevision();
    await frameRuntime!.getRouteScope().get(NavigateServiceInterface).query({ tab: 'history' });

    expect(moduleRuntime!.getRevalidateRevision()).toBe(nextModuleRevision);
    expect(frameRuntime!.getRevalidateRevision()).toBeGreaterThan(frameRevision);

    await app.dispose();
  });
});

const createApplication = async (
  router: Router,
  initialNavigation: InitialNavigation,
  runtimeRetention: RouterBridgeRuntimeRetention = 'retain',
): Promise<TestApplication> => {
  const app = new TestApplication(router, initialNavigation, runtimeRetention);

  app.compose();
  await app.initialize();

  return app;
};

const createBranchRouter = (slowLoad: () => Promise<Record<string, unknown>> = loadTestModule): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('workspaces', param('workspaceId')),
        routes: [
          createModuleRoute(FirstRoute, 'first'),
          createModuleRoute(SecondRoute, 'second'),
          new Route({ address: segments('slow'), load: slowLoad, token: SlowRoute }),
        ],
        token: WorkspaceRoute,
      }),
      createModuleRoute(OtherRoute, 'other'),
    ],
  });
};

const createIndexRouter = (): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('index-parent'),
        routes: [new Route({ load: loadTestModule, token: IndexRoute })],
        token: IndexParentRoute,
      }),
    ],
  });
};

const createDefaultRouter = (): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('default-parent'),
        defaultTo: DefaultRoute,
        routes: [createModuleRoute(FirstRoute, 'first'), createModuleRoute(DefaultRoute, 'default')],
        token: DefaultParentRoute,
      }),
    ],
  });
};

const createFirstAvailableRouter = (): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('first-available-parent'),
        defaultTo: Router.firstAvailable(),
        routes: [
          new Route({
            address: segments('denied'),
            canMatch: [DenyPolicy],
            load: loadTestModule,
            token: DeniedRoute,
          }),
          createModuleRoute(AvailableRoute, 'available'),
        ],
        token: FirstAvailableParentRoute,
      }),
    ],
  });
};

const createRevalidationRouter = (): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('revalidation'),
        providers: [RevalidationProvider],
        routes: [createModuleRoute(RevalidationLeafRoute, 'leaf')],
        token: RevalidationParentRoute,
      }),
    ],
  });
};

const createScopedQueryRouter = (): Router => {
  const frameRouter = new Router({ routes: [createModuleRoute(QueryFrameRoute, 'frame')] });
  return new Router({
    routes: [
      new Route({
        address: segments('module'),
        load: loadTestModule,
        routing: [frameRouter],
        token: QueryModuleRoute,
      }),
    ],
  });
};

const createModuleRoute = (token: abstract new (...args: never[]) => object, address: string): Route => {
  return new Route({ address: segments(address), load: loadTestModule, token });
};

const loadTestModule = async (): Promise<Record<string, unknown>> => ({ module: TestModule });

const createDeferred = <TValue>(): Deferred<TValue> => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve };
};
