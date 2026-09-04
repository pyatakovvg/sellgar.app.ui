import { describe, expect, it, vi } from 'vitest';

import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import { Controller, type ControllerArgs, type WithPayload } from '../../../controller/contract/controller';
import type { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Inject } from '../../../di/injection/decorators';
import { UnauthorizedException } from '../../../http/exception/http-exception';
import { Policy } from '../../../policy/contract/policy';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
} from '../../../router/bridge/router-bridge';
import { param, segments } from '../../../router/declaration/address';
import { getRouteDefinition, Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { matchesNavigationRoute, type NavigationState } from '../../../router/runtime/navigation-state';
import { RoutePolicyInterface } from '../../../router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../router/runtime/route-runtime-context';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { Initializer } from '../../initializer/application-initializer';
import type {
  ApplicationInitializerContextInterface,
  ApplicationInitializerInterface,
  ApplicationInitializerToken,
} from '../../initializer/application-initializer';
import { RequestExecutorInterface } from '../../request/request-executor';
import { SessionRuntimeStateInterface } from '../../session/session-runtime-state';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Application } from './application.ts';
import type { ApplicationNavigationSnapshot } from './application.ts';

abstract class SignInRoute {}
abstract class ProtectedRoute {}
abstract class AlternateProtectedRoute {}
abstract class NestedProtectedRoute {
  abstract readonly id: string;
}
abstract class DeepRoute {
  abstract readonly id: string;
}
abstract class InspectorRoute {
  abstract readonly id: string;
}
abstract class SessionAgnosticRoute {}

abstract class TestAuthControllerInterface {
  abstract action(args: ControllerArgs<WithPayload<'authenticate' | 'unauthorized'>>): void | Promise<void>;
}

@Controller()
class TestAuthController implements TestAuthControllerInterface {
  constructor(
    @Inject(SessionRuntimeStateInterface)
    private readonly session: SessionRuntimeStateInterface,
    @Inject(RequestExecutorInterface)
    private readonly requests: RequestExecutorInterface,
  ) {}

  async action(args: ControllerArgs<WithPayload<'authenticate' | 'unauthorized'>>): Promise<void> {
    if (args.payload === 'authenticate') {
      this.session.setAuthenticated();
      return;
    }

    await this.requests.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));
  }
}

class TestBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestAuthControllerInterface).to(TestAuthController).inTransientScope();
  }
}

@UseBindings(TestBindings)
class TestModule {}

@Initializer()
class AuthenticateInitializer implements ApplicationInitializerInterface {
  execute(context: ApplicationInitializerContextInterface): void {
    context.session.setAuthenticated();
  }
}

@Policy()
class RequireAuthenticatedSessionPolicy extends RoutePolicyInterface {
  execute(context: RouteRuntimeContextInterface): PolicyResult {
    return context.session.phase === 'authenticated' ? { type: 'pass' } : { reason: 'anonymous', type: 'fail' };
  }
}

@Policy()
class RequireAnonymousSessionPolicy extends RoutePolicyInterface {
  execute(context: RouteRuntimeContextInterface): PolicyResult {
    return context.session.phase === 'authenticated' ? { reason: 'authenticated', type: 'fail' } : { type: 'pass' };
  }
}

class TestModuleExportResolver implements ModuleExportResolverInterface<null> {
  resolve() {
    return createModuleRuntimeDefinition({ presentation: null, token: TestModule });
  }
}

class TestRouterBridge implements RouterBridgeInterface {
  readonly commits: NavigationState[] = [];

  constructor(readonly runtimeRetention: 'release' | 'retain' = 'retain') {}

  back(): void {}

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    await context.navigate.to(ProtectedRoute);
  }

  commit(navigation: NavigationState, _context: RouterBridgeCommitContextInterface): void {
    this.commits.push(navigation);
  }

  dispose(): void {}
}

class DirectSignInTestRouterBridge extends TestRouterBridge {
  override async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    await context.navigate.to(SignInRoute);
  }
}

class SessionAgnosticTestRouterBridge extends TestRouterBridge {
  override async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    await context.navigate.to(SessionAgnosticRoute);
  }
}

class NestedTestRouterBridge extends TestRouterBridge {
  override async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    await context.restore(
      {
        address: ['ones', 'one-next', 'twise', 'twise-next'],
        nested: { address: ['inspect', 'inspect-3'], query: {} },
        query: {},
        state: undefined,
      },
      { blockersConfirmed: false },
    );
  }
}

class DeepTestRouterBridge extends TestRouterBridge {
  override async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    await context.restore(
      {
        address: ['ones', 'one-next', 'twise', 'twise-next'],
        nested: null,
        query: {},
        state: undefined,
      },
      { blockersConfirmed: false },
    );
  }
}

class TestApplication extends Application<null> {
  constructor(
    bridge: RouterBridgeInterface,
    private readonly router: Router,
    private readonly initializers: readonly ApplicationInitializerToken[] = [],
  ) {
    super(bridge, new ApplicationConfig(), new TestModuleExportResolver());
  }

  get navigation(): ApplicationNavigationSnapshot {
    return this.getNavigationSnapshot();
  }

  get branch() {
    return this.getRouterRuntime().getBranchSnapshot();
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get sessionState(): SessionRuntimeStateInterface {
    return this.getApplicationScope().get(SessionRuntimeStateInterface);
  }

  get requests(): RequestExecutorInterface {
    return this.getApplicationScope().get(RequestExecutorInterface);
  }

  get runtimeEntryCount(): number {
    return this.getRouterRuntimeEntries().length;
  }

  action(payload: 'authenticate' | 'unauthorized'): Promise<unknown> {
    return this.getRouterRuntime().getActiveRouteRuntimes().at(-1)!.action(TestAuthControllerInterface, payload);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.initializers(this.initializers);
    app.router(this.router);
  }
}

describe('Application authentication lifecycle', () => {
  it('resolves the initial session before protected route policies and does not schedule a duplicate navigation', async () => {
    const signInLoad = vi.fn(async () => ({}));
    const protectedLoad = vi.fn(async () => ({}));
    const bridge = new TestRouterBridge();
    const app = new TestApplication(bridge, createAuthRouter(signInLoad, protectedLoad), [AuthenticateInitializer]);

    app.compose();
    await app.initialize();

    expect(app.sessionState.phase).toBe('authenticated');
    expect(matchesNavigationRoute(app.navigation.navigation, ProtectedRoute)).toBe(true);
    expect(signInLoad).not.toHaveBeenCalled();
    expect(protectedLoad).toHaveBeenCalledOnce();
    expect(bridge.commits).toHaveLength(1);

    await app.dispose();
  });

  it('redirects direct protected navigation to sign-in and restores it through one refresh wave per session change', async () => {
    const signInLoad = vi.fn(async () => ({}));
    const protectedLoad = vi.fn(async () => ({}));
    const bridge = new TestRouterBridge();
    const app = new TestApplication(bridge, createAuthRouter(signInLoad, protectedLoad));

    app.compose();
    await app.initialize();

    expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true);
    expect(signInLoad).toHaveBeenCalledOnce();
    expect(protectedLoad).not.toHaveBeenCalled();

    app.sessionState.setAuthenticated();

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, ProtectedRoute)).toBe(true));
    expect(protectedLoad).toHaveBeenCalledOnce();

    app.sessionState.setAnonymous();

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true));
    expect(signInLoad).toHaveBeenCalledTimes(2);

    app.sessionState.setAuthenticated();

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, ProtectedRoute)).toBe(true));
    expect(protectedLoad).toHaveBeenCalledTimes(2);
    expect(bridge.commits).toHaveLength(4);

    await app.dispose();
  });

  it('redirects direct sign-in to the protected root after authentication without a saved location', async () => {
    const bridge = new DirectSignInTestRouterBridge();
    const app = new TestApplication(
      bridge,
      createAuthRouter(
        vi.fn(async () => ({})),
        vi.fn(async () => ({})),
      ),
    );

    app.compose();
    await app.initialize();

    expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true);

    await app.action('authenticate');

    expect(app.sessionState.phase).toBe('authenticated');
    expect(matchesNavigationRoute(app.navigation.navigation, ProtectedRoute)).toBe(true);

    await app.dispose();
  });

  it('starts a fresh first-available branch after explicit sign-out instead of restoring the previous session', async () => {
    const signInLoad = vi.fn(async () => ({}));
    const protectedLoad = vi.fn(async () => ({}));
    const alternateLoad = vi.fn(async () => ({}));
    const app = new TestApplication(
      new TestRouterBridge(),
      createExplicitSignOutRouter(signInLoad, protectedLoad, alternateLoad),
      [AuthenticateInitializer],
    );

    app.compose();
    await app.initialize();
    await app.navigate.to(AlternateProtectedRoute);

    expect(matchesNavigationRoute(app.navigation.navigation, AlternateProtectedRoute)).toBe(true);

    app.sessionState.setAnonymous();

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true));
    expect(app.runtimeEntryCount).toBe(1);
    expect(signInLoad).toHaveBeenCalledOnce();

    app.sessionState.setAuthenticated();

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, ProtectedRoute)).toBe(true));
    expect(matchesNavigationRoute(app.navigation.navigation, AlternateProtectedRoute)).toBe(false);
    expect(app.runtimeEntryCount).toBe(1);
    expect(protectedLoad).toHaveBeenCalledTimes(2);
    expect(alternateLoad).toHaveBeenCalledOnce();

    await app.dispose();
  });

  it.each(['retain', 'release'] as const)(
    'restarts an otherwise reusable route when the session phase changes in %s mode',
    async (runtimeRetention) => {
      const load = vi.fn(async () => ({}));
      const app = new TestApplication(
        new SessionAgnosticTestRouterBridge(runtimeRetention),
        new Router({
          routes: [
            new Route({
              address: segments('session-agnostic'),
              load,
              token: SessionAgnosticRoute,
            }),
          ],
        }),
        [AuthenticateInitializer],
      );

      app.compose();
      await app.initialize();

      expect(load).toHaveBeenCalledOnce();

      app.sessionState.setAnonymous();

      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(matchesNavigationRoute(app.navigation.navigation, SessionAgnosticRoute)).toBe(true);
      expect(app.runtimeEntryCount).toBe(1);

      await app.dispose();
    },
  );

  it('contains concurrent protected 401 responses and performs one anonymous-route refresh wave', async () => {
    const bridge = new TestRouterBridge();
    const app = new TestApplication(
      bridge,
      createAuthRouter(
        vi.fn(async () => ({})),
        vi.fn(async () => ({})),
      ),
      [AuthenticateInitializer],
    );
    const unauthorized = new UnauthorizedException({ title: 'Unauthorized' });

    app.compose();
    await app.initialize();

    void app.requests.run(() => Promise.reject(unauthorized));
    void app.requests.run(() => Promise.reject(unauthorized));

    await vi.waitFor(() => expect(app.sessionState.phase).toBe('anonymous'));
    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true));
    expect(bridge.commits).toHaveLength(2);

    await app.dispose();
  });

  it('restores the complete nested navigation after protected 401 and sign-in', async () => {
    const protectedLoad = vi.fn(async () => ({}));
    const inspectorLoad = vi.fn(async () => ({}));
    const bridge = new NestedTestRouterBridge();
    const app = new TestApplication(
      bridge,
      createNestedAuthRouter(
        vi.fn(async () => ({})),
        protectedLoad,
        inspectorLoad,
      ),
      [AuthenticateInitializer],
    );
    app.compose();
    await app.initialize();

    expect(matchesNavigationRoute(app.navigation.navigation, InspectorRoute)).toBe(true);

    await app.action('unauthorized');

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true));

    await app.action('authenticate');

    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, InspectorRoute)).toBe(true));
    expect(protectedLoad).toHaveBeenCalledTimes(2);
    expect(inspectorLoad).toHaveBeenCalledTimes(2);
    expect(app.runtimeEntryCount).toBe(1);

    await app.dispose();
  });

  it('keeps the committed anonymous branch visible until the complete protected branch is ready', async () => {
    const protectedModule = createDeferred<Readonly<Record<string, unknown>>>();
    const protectedFrame = createDeferred<Readonly<Record<string, unknown>>>();
    const protectedLoad = vi.fn(() => protectedModule.promise);
    const inspectorLoad = vi.fn(() => protectedFrame.promise);
    const app = new TestApplication(
      new NestedTestRouterBridge(),
      createNestedAuthRouter(
        vi.fn(async () => ({})),
        protectedLoad,
        inspectorLoad,
      ),
    );

    app.compose();
    await app.initialize();

    expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true);

    const authentication = app.action('authenticate');

    await vi.waitFor(() => {
      expect(protectedLoad).toHaveBeenCalledOnce();
      expect(inspectorLoad).toHaveBeenCalledOnce();
    });

    expect(app.branch.pending).toBe(true);
    expect(app.branch.routes).toHaveLength(1);
    expect(getRouteDefinition(app.branch.routes[0]!.route).token).toBe(SignInRoute);
    expect(app.branch.pendingLocalChange).toEqual({ commonRouteCount: 0 });
    expect(app.branch.child).toBeNull();
    expect(matchesNavigationRoute(app.navigation.navigation, SignInRoute)).toBe(true);

    protectedModule.resolve({});
    await Promise.resolve();

    expect(getRouteDefinition(app.branch.routes[0]!.route).token).toBe(SignInRoute);
    expect(app.branch.child).toBeNull();

    protectedFrame.resolve({});

    await authentication;
    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, InspectorRoute)).toBe(true));
    expect(app.branch.pending).toBe(false);
    expect(app.branch.child).not.toBeNull();

    await app.dispose();
  });

  it('keeps the committed frame as the single pending boundary during nested navigation', async () => {
    const nextFrame = createDeferred<Readonly<Record<string, unknown>>>();
    const inspectorLoad = vi
      .fn<() => Promise<Readonly<Record<string, unknown>>>>()
      .mockResolvedValueOnce({})
      .mockImplementationOnce(() => nextFrame.promise);
    const app = new TestApplication(
      new NestedTestRouterBridge(),
      createNestedAuthRouter(
        vi.fn(async () => ({})),
        vi.fn(async () => ({})),
        inspectorLoad,
      ),
      [AuthenticateInitializer],
    );

    app.compose();
    await app.initialize();

    const navigation = app.navigate.to(InspectorRoute, { params: { id: 'inspect-next' } });

    await vi.waitFor(() => expect(inspectorLoad).toHaveBeenCalledTimes(2));

    const rootBranch = app.branch;
    const frameBranch = rootBranch.child!.runtime.getBranchSnapshot();

    expect(rootBranch.pending).toBe(true);
    expect(rootBranch.pendingLocalChange).toBeNull();
    expect(rootBranch.childPending).toBe(false);
    expect(frameBranch.pending).toBe(true);
    expect(frameBranch.routes).toHaveLength(1);
    expect(getRouteDefinition(frameBranch.routes[0]!.route).token).toBe(InspectorRoute);
    expect(frameBranch.pendingLocalChange).toEqual({ commonRouteCount: 0 });

    nextFrame.resolve({});
    await navigation;

    expect(app.branch.pending).toBe(false);
    expect(app.branch.child!.runtime.getBranchSnapshot().pending).toBe(false);

    await app.dispose();
  });

  it('exposes only a shell fallback while the first nested branch is pending', async () => {
    const nextFrame = createDeferred<Readonly<Record<string, unknown>>>();
    const inspectorLoad = vi.fn(() => nextFrame.promise);
    const app = new TestApplication(
      new DeepTestRouterBridge(),
      createNestedAuthRouter(
        vi.fn(async () => ({})),
        vi.fn(async () => ({})),
        inspectorLoad,
      ),
      [AuthenticateInitializer],
    );

    app.compose();
    await app.initialize();

    const navigation = app.navigate.to(InspectorRoute, { params: { id: 'inspect-next' } });

    await vi.waitFor(() => expect(inspectorLoad).toHaveBeenCalledOnce());

    const rootBranch = app.branch;

    expect(rootBranch.pendingLocalChange).toBeNull();
    expect(rootBranch.childPending).toBe(true);
    expect(rootBranch.child).not.toBeNull();
    expect(rootBranch.child!.runtime.getBranchSnapshot().routes).toHaveLength(0);

    nextFrame.resolve({});
    await navigation;

    expect(app.branch.childPending).toBe(false);
    expect(app.branch.child!.runtime.getBranchSnapshot().routes).toHaveLength(1);

    await app.dispose();
  });
});

const createAuthRouter = (
  signInLoad: () => Promise<Readonly<Record<string, unknown>>>,
  protectedLoad: () => Promise<Readonly<Record<string, unknown>>>,
): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('sign-in'),
        canMatch: [RequireAnonymousSessionPolicy.configure().onFail(Router.redirectToSaved({ replace: true }))],
        load: signInLoad,
        token: SignInRoute,
      }),
      new Route({
        address: segments('protected'),
        canMatch: [
          RequireAuthenticatedSessionPolicy.configure().onFail(
            Router.redirectTo(SignInRoute, { replace: true, saveCurrentLocation: true }),
          ),
        ],
        load: protectedLoad,
        token: ProtectedRoute,
      }),
    ],
  });
};

const createExplicitSignOutRouter = (
  signInLoad: () => Promise<Readonly<Record<string, unknown>>>,
  protectedLoad: () => Promise<Readonly<Record<string, unknown>>>,
  alternateLoad: () => Promise<Readonly<Record<string, unknown>>>,
): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('sign-in'),
        canMatch: [RequireAnonymousSessionPolicy.configure().onFail(Router.redirectToSaved({ replace: true }))],
        load: signInLoad,
        token: SignInRoute,
      }),
      new Route({
        address: segments('protected'),
        canMatch: [
          RequireAuthenticatedSessionPolicy.configure().onFail(
            Router.redirectTo(SignInRoute, { replace: true, saveCurrentLocation: true }),
          ),
        ],
        load: protectedLoad,
        token: ProtectedRoute,
      }),
      new Route({
        address: segments('alternate'),
        canMatch: [
          RequireAuthenticatedSessionPolicy.configure().onFail(
            Router.redirectTo(SignInRoute, { replace: true, saveCurrentLocation: true }),
          ),
        ],
        load: alternateLoad,
        token: AlternateProtectedRoute,
      }),
    ],
  });
};

const createNestedAuthRouter = (
  signInLoad: () => Promise<Readonly<Record<string, unknown>>>,
  protectedLoad: () => Promise<Readonly<Record<string, unknown>>>,
  inspectorLoad: () => Promise<Readonly<Record<string, unknown>>> = async () => ({}),
): Router => {
  return new Router({
    routes: [
      new Route({
        address: segments('sign-in'),
        canMatch: [RequireAnonymousSessionPolicy.configure().onFail(Router.redirectToSaved({ replace: true }))],
        load: signInLoad,
        token: SignInRoute,
      }),
      new Route({
        canMatch: [
          RequireAuthenticatedSessionPolicy.configure().onFail(
            Router.redirectTo(SignInRoute, { replace: true, saveCurrentLocation: true }),
          ),
        ],
        routes: [
          new Route({
            address: segments('ones', param('id')),
            routes: [
              new Route({
                address: segments('twise', param('id')),
                load: protectedLoad,
                token: DeepRoute,
              }),
            ],
            routing: [
              new Router({
                routes: [
                  new Route({
                    address: segments('inspect', param('id')),
                    load: inspectorLoad,
                    token: InspectorRoute,
                  }),
                ],
              }),
            ],
            token: NestedProtectedRoute,
          }),
        ],
      }),
    ],
  });
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
};
