import { afterEach, describe, expect, it, vi } from 'vitest';

import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { Policy } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import type {
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
  RouterBridgeRuntimeRetention,
} from '../../../router/bridge/router-bridge';
import { segments } from '../../../router/declaration/address';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { RoutePolicyInterface } from '../../../router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../router/runtime/route-runtime-context';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { Provider, type ProviderInterface } from '../../../runtime/provider/provider';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';

import { Application } from './application.ts';

abstract class ModuleRoute {}
abstract class FirstFrameRoute {}
abstract class SecondFrameRoute {}
abstract class OtherRoute {}
abstract class LastRoute {}
class TestModule {}

class TestModuleExportResolver implements ModuleExportResolverInterface<null> {
  resolve() {
    return createModuleRuntimeDefinition({ presentation: null, token: TestModule });
  }
}

class TestBridge implements RouterBridgeInterface {
  private context: RouterBridgeInitializeContextInterface | null = null;

  constructor(readonly runtimeRetention: RouterBridgeRuntimeRetention) {}

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    this.context = context;
    await context.navigate.through(ModuleRoute).to(FirstFrameRoute);
  }

  async back(): Promise<void> {
    await this.context!.back();
  }
  commit(): void {}
  dispose(): void {}
}

class TestApplication extends Application<null> {
  constructor(
    private readonly router: Router,
    retention: RouterBridgeRuntimeRetention,
  ) {
    super(new TestBridge(retention), new ApplicationConfig(), new TestModuleExportResolver());
  }

  get navigate() {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get routes() {
    return this.getRouterRuntime().getActiveRouteRuntimes();
  }

  get pendingRoutes() {
    return this.getRouterRuntime().getPendingRouteRuntimes();
  }

  observePending(listener: () => void): () => void {
    return this.getRouterRuntime().subscribe(listener);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(this.router);
  }
}

type Boundary = 'canMatch' | 'canActivate';
type Outcome = 'forbidden' | 'not-found' | 'redirect' | 'error';

const createFixture = async (
  retention: RouterBridgeRuntimeRetention,
  boundary: Boundary,
  outcome: Outcome = 'forbidden',
  initialFrameDenied = false,
  initialModuleDenied = false,
) => {
  const failure = new Error('module permission denied');
  let evaluate: (context: RouteRuntimeContextInterface) => PolicyResult | Promise<PolicyResult> = () => ({
    type: initialModuleDenied ? 'fail' : 'pass',
  });
  const policy = vi.fn((context: RouteRuntimeContextInterface) => evaluate(context));
  const disposed = vi.fn();
  const initialized = vi.fn();

  @Policy()
  class Permission extends RoutePolicyInterface {
    execute(context: RouteRuntimeContextInterface): PolicyResult | Promise<PolicyResult> {
      return policy(context);
    }
  }

  @Policy()
  class DenyFrame extends RoutePolicyInterface {
    execute(): PolicyResult {
      return { type: 'fail' };
    }
  }

  @Provider()
  class ModuleProvider implements ProviderInterface {
    constructor() {
      initialized();
    }

    dispose(): void {
      disposed();
    }
  }

  const loadModule = vi.fn(async () => ({}));
  const loadFirst = vi.fn(async () => ({}));
  const loadSecond = vi.fn(async () => ({}));
  const onFail =
    outcome === 'redirect'
      ? Router.redirectTo(OtherRoute, { replace: true })
      : outcome === 'not-found'
        ? Router.notFound()
        : outcome === 'error'
          ? Router.error(failure)
          : Router.forbidden();
  const module = new Route({
    address: segments('module'),
    token: ModuleRoute,
    load: loadModule,
    providers: [ModuleProvider],
    [boundary]: [Permission.configure().onFail(onFail)],
    routing: [
      new Router({
        routes: [
          new Route({
            address: segments('first'),
            token: FirstFrameRoute,
            load: loadFirst,
            canMatch: initialFrameDenied ? [DenyFrame] : [],
          }),
          new Route({ address: segments('second'), token: SecondFrameRoute, load: loadSecond }),
        ],
      }),
    ],
  });
  const app = new TestApplication(
    new Router({
      routes: [
        module,
        new Route({ address: segments('other'), token: OtherRoute, load: async () => ({}) }),
        new Route({ address: segments('last'), token: LastRoute, load: async () => ({}) }),
      ],
    }),
    retention,
  );
  app.compose();
  await app.initialize();
  return {
    app,
    disposed,
    initialized,
    loadModule,
    loadFirst,
    loadSecond,
    policy,
    failure,
    evaluate(next: typeof evaluate) {
      evaluate = next;
    },
  };
};

const matrix = (['release', 'retain'] as const).flatMap((retention) =>
  (['canMatch', 'canActivate'] as const).flatMap((boundary) =>
    (['forbidden', 'not-found', 'redirect', 'error'] as const).map((outcome) => ({ retention, boundary, outcome })),
  ),
);

describe('Application policy boundaries with retained routes', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(matrix)(
    'checks $boundary when returning to a module with a new frame ($retention, $outcome)',
    async ({ retention, boundary, outcome }) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fixture = await createFixture(retention, boundary, outcome);
      const { app, policy, loadSecond, loadModule, loadFirst, disposed, initialized, failure } = fixture;
      const [module, first] = app.routes;
      try {
        await app.navigate.to(OtherRoute);
        const disposedBeforeAttempt = disposed.mock.calls.length;
        fixture.evaluate(() => ({ type: 'fail' }));
        await app.navigate.through(ModuleRoute).to(SecondFrameRoute);

        expect(policy).toHaveBeenCalledTimes(2);
        expect(loadSecond).not.toHaveBeenCalled();
        expect(loadModule).toHaveBeenCalledOnce();
        expect(app.pendingRoutes).toHaveLength(0);
        if (outcome === 'redirect') {
          expect(app.routes.map((route) => route.route)).not.toContain(module!.route);
        } else {
          const rejected = app.routes.at(-1)!;
          expect(rejected.getSnapshot().phase).toBe(outcome === 'error' ? 'failed' : outcome);
          if (outcome === 'error') expect(rejected.getSnapshot().exception?.error).toBe(failure);
        }
        expect(disposed).toHaveBeenCalledTimes(disposedBeforeAttempt);
        if (retention === 'retain') {
          expect(module!.getSnapshot()).toEqual({ phase: 'retained', exception: null });
          expect(first!.getSnapshot()).toEqual({ phase: 'retained', exception: null });
          fixture.evaluate(() => ({ type: 'pass' }));
          await app.navigate.through(ModuleRoute).to(FirstFrameRoute);
          expect(app.routes).toEqual([module, first]);
          expect(loadFirst).toHaveBeenCalledOnce();
          expect(loadModule).toHaveBeenCalledOnce();
        }
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledTimes(initialized.mock.calls.length);
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'restores the original retained module and frame on Back after a denied %s reentry',
    async (boundary) => {
      const fixture = await createFixture('retain', boundary);
      const { app, loadModule, loadFirst, loadSecond, disposed } = fixture;
      const [module, first] = app.routes;
      try {
        await app.navigate.to(OtherRoute);
        fixture.evaluate(() => ({ type: 'fail' }));
        await app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        expect(loadSecond).not.toHaveBeenCalled();
        fixture.evaluate(() => ({ type: 'pass' }));
        await app.navigate.back();
        await app.navigate.back();
        expect(app.routes).toEqual([module, first]);
        expect(module!.getSnapshot()).toEqual({ phase: 'active', exception: null });
        expect(first!.getSnapshot()).toEqual({ phase: 'active', exception: null });
        expect(loadModule).toHaveBeenCalledOnce();
        expect(loadFirst).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(
    (['canMatch', 'canActivate'] as const).flatMap((boundary) =>
      (['first', 'second'] as const).map((frame) => ({ boundary, frame })),
    ),
  )(
    'rechecks and rebuilds a previously forbidden module when $boundary passes ($frame frame)',
    async ({ boundary, frame }) => {
      const fixture = await createFixture('retain', boundary, 'forbidden', false, true);
      const { app, policy, loadModule, loadFirst, loadSecond, initialized, disposed } = fixture;
      const forbidden = app.routes[0]!;
      try {
        expect(forbidden.getSnapshot().phase).toBe('forbidden');
        expect(loadModule).not.toHaveBeenCalled();
        await app.navigate.to(OtherRoute);
        fixture.evaluate(() => ({ type: 'pass' }));
        if (frame === 'first') await app.navigate.through(ModuleRoute).to(FirstFrameRoute);
        else await app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        expect(policy).toHaveBeenCalledTimes(2);
        expect(app.routes.map((route) => route.getSnapshot().phase)).toEqual(['active', 'active']);
        expect(app.routes[0]).not.toBe(forbidden);
        expect(forbidden.getSnapshot().phase).toBe('forbidden');
        expect(loadModule).toHaveBeenCalledOnce();
        expect(loadFirst).toHaveBeenCalledTimes(frame === 'first' ? 1 : 0);
        expect(loadSecond).toHaveBeenCalledTimes(frame === 'second' ? 1 : 0);
        expect(initialized).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'selects the healthy saved activation when an earlier forbidden entry has the same address (%s)',
    async (boundary) => {
      const fixture = await createFixture('retain', boundary, 'forbidden', false, true);
      const { app, loadModule, loadFirst, initialized, disposed } = fixture;
      try {
        await app.navigate.to(OtherRoute);
        fixture.evaluate(() => ({ type: 'pass' }));
        await app.navigate.through(ModuleRoute).to(FirstFrameRoute);
        const [module, first] = app.routes;
        expect(first!.getSnapshot().phase).toBe('active');
        await app.navigate.to(OtherRoute);
        await app.navigate.through(ModuleRoute).to(FirstFrameRoute);
        expect(app.routes).toEqual([module, first]);
        expect(loadModule).toHaveBeenCalledOnce();
        expect(loadFirst).toHaveBeenCalledOnce();
        expect(initialized).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'reuses an allowed retained module with a newly opened frame after checking %s',
    async (boundary) => {
      const { app, policy, loadModule, loadFirst, loadSecond, initialized, disposed } = await createFixture(
        'retain',
        boundary,
      );
      const [module, first] = app.routes;
      try {
        await app.navigate.to(OtherRoute);
        await app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        expect(policy).toHaveBeenCalledTimes(2);
        expect(app.routes[0]).toBe(module);
        expect(module!.getSnapshot().phase).toBe('active');
        expect(first!.getSnapshot().phase).toBe('retained');
        expect(loadModule).toHaveBeenCalledOnce();
        expect(loadFirst).toHaveBeenCalledOnce();
        expect(loadSecond).toHaveBeenCalledOnce();
        expect(initialized).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'does not recheck an unchanged common module %s on a child transition',
    async (boundary) => {
      const { app, policy, loadSecond, disposed } = await createFixture('retain', boundary);
      const module = app.routes[0]!;
      try {
        await app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        expect(policy).toHaveBeenCalledOnce();
        expect(app.routes[0]).toBe(module);
        expect(loadSecond).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'keeps the active common module %s boundary when leaving a forbidden child',
    async (boundary) => {
      const { app, policy, loadModule, loadFirst, loadSecond, initialized, disposed } = await createFixture(
        'retain',
        boundary,
        'forbidden',
        true,
      );
      const module = app.routes[0]!;
      try {
        expect(module.getSnapshot().phase).toBe('active');
        expect(app.routes.at(-1)!.getSnapshot().phase).toBe('forbidden');
        expect(policy).toHaveBeenCalledOnce();
        await app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        expect(policy).toHaveBeenCalledOnce();
        expect(app.routes[0]).toBe(module);
        expect(module.getSnapshot().phase).toBe('active');
        expect(app.routes.at(-1)!.getSnapshot().phase).toBe('active');
        expect(loadModule).toHaveBeenCalledOnce();
        expect(loadFirst).not.toHaveBeenCalled();
        expect(loadSecond).toHaveBeenCalledOnce();
        expect(initialized).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
      } finally {
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'disposes a newly allocated %s rejection boundary when a newer navigation cancels publication',
    async (boundary) => {
      const fixture = await createFixture('retain', boundary);
      const { app, loadSecond, disposed } = fixture;
      const [module, first] = app.routes;
      let boundaryRuntime: (typeof app.routes)[number] | undefined;
      let replacement: Promise<void> | undefined;
      let unsubscribe = () => undefined as void;
      try {
        await app.navigate.to(OtherRoute);
        fixture.evaluate(() => ({ type: 'fail' }));
        unsubscribe = app.observePending(() => {
          if (boundaryRuntime) return;
          const candidate = app.pendingRoutes.find((route) => route.route === module!.route && route !== module);
          if (!candidate) return;
          boundaryRuntime = candidate;
          replacement = app.navigate.to(LastRoute);
        });
        await app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        await replacement;
        expect(boundaryRuntime).toBeDefined();
        expect(boundaryRuntime!.getSnapshot().phase).toBe('disposed');
        expect(module!.getSnapshot()).toEqual({ phase: 'retained', exception: null });
        expect(first!.getSnapshot()).toEqual({ phase: 'retained', exception: null });
        expect(loadSecond).not.toHaveBeenCalled();
        expect(disposed).not.toHaveBeenCalled();
        expect(app.pendingRoutes).toHaveLength(0);
        fixture.evaluate(() => ({ type: 'pass' }));
        await app.navigate.through(ModuleRoute).to(FirstFrameRoute);
        expect(app.routes).toEqual([module, first]);
      } finally {
        unsubscribe();
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );

  it.each(['canMatch', 'canActivate'] as const)(
    'cancels an asynchronous reentry %s without changing the retained module',
    async (boundary) => {
      const fixture = await createFixture('retain', boundary);
      const { app, disposed, loadFirst, loadSecond } = fixture;
      const [module, first] = app.routes;
      let resolve!: (result: PolicyResult) => void;
      const pending = new Promise<PolicyResult>((done) => {
        resolve = done;
      });
      let observed: AbortSignal | undefined;
      try {
        await app.navigate.to(OtherRoute);
        fixture.evaluate((context) => {
          observed = context.signal;
          return pending;
        });
        const entering = app.navigate.through(ModuleRoute).to(SecondFrameRoute);
        await vi.waitFor(() => expect(observed).toBeDefined());
        const replacing = app.navigate.to(LastRoute);
        await vi.waitFor(() => expect(observed!.aborted).toBe(true));
        resolve({ type: 'fail' });
        await Promise.all([entering, replacing]);
        expect(module!.getSnapshot()).toEqual({ phase: 'retained', exception: null });
        expect(first!.getSnapshot()).toEqual({ phase: 'retained', exception: null });
        expect(loadSecond).not.toHaveBeenCalled();
        expect(disposed).not.toHaveBeenCalled();
        expect(app.pendingRoutes).toHaveLength(0);
        fixture.evaluate(() => ({ type: 'pass' }));
        await app.navigate.through(ModuleRoute).to(FirstFrameRoute);
        expect(app.routes).toEqual([module, first]);
        expect(loadFirst).toHaveBeenCalledOnce();
      } finally {
        resolve({ type: 'pass' });
        await app.dispose();
      }
      expect(disposed).toHaveBeenCalledOnce();
    },
  );
});
