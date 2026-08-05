import 'reflect-metadata';

import type { LoaderFunctionArgs } from 'react-router-dom';
import { describe, expect, it, vi, type MockInstance } from 'vitest';

import { Controller } from '../../../controller/contract/controller';

import type {
  SessionRuntimePhase,
  SessionRuntimeStateListener,
} from '../../../application/session/session-runtime-state';
import {
  ApplicationControllerInterface,
  type ApplicationLifecycleSnapshot,
} from '../../../application/lifecycle/application-lifecycle';
import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { ControllerInterface, ControllerLoaderArgs } from '../../../controller/contract/controller';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Inject, Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { Frame, FrameDefinition } from '../../../frame/declaration/frame';
import { FrameBindings } from '../../../frame/service/frame-service';
import { HashFrameSource } from '../../../frame/source/hash-frame-source';
import type { FrameConstructor } from '../../../frame/declaration/frame';
import { Module } from '../../../module/declaration/module';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import { ApplicationScope, FrameScope, RouteScope } from '../../../runtime/scope/kind';
import { RuntimeFailureReporterInterface } from '../../../runtime/failure';
import {
  Provider,
  RuntimeProviderInterface,
  type RuntimeProviderContextInterface,
  type RuntimeProviderResult,
} from '../../../runtime/provider/runtime-provider';
import { Layout } from '../../../layout/declaration/layout';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { RouteDefaultTo } from '../../declaration/route';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { LocationServiceInterface } from '../../service/location-service';
import { NavigationContinuationServiceInterface } from '../../service/navigation-continuation-service';
import { RouterServiceBindings } from '../../service/router-service';

import { RoutePolicyInterface } from '../route-policy';
import { RouterRuntime } from '../router-runtime';
import type { RoutePolicyDeclarations } from '../route-runtime-context';

import { RouteRuntime } from './';

describe('RouteRuntime', () => {
  it('reports route provider setup errors with provider phase code', async () => {
    const setupError = new Error('setup route-провайдера завершился с ошибкой.');
    const fixture = createRouteRuntimeFixture({
      routeProviderSetup: () => {
        throw setupError;
      },
      routeProviders: [TestRouteProvider],
    });

    await expect(fixture.runtime.loader(createLoaderArgs())).rejects.toThrow(
      'setup route-провайдера завершился с ошибкой.',
    );

    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'route.activation-failed',
        failure: expect.objectContaining({
          cause: setupError,
          source: expect.objectContaining({
            operation: 'setup',
            owner: expect.objectContaining({ kind: 'route' }),
            participant: expect.objectContaining({ kind: 'provider' }),
          }),
        }),
      }),
    );
  });

  it('reports module provider beforeRender errors with provider phase code', async () => {
    const beforeRenderError = new Error('beforeRender провайдера завершился с ошибкой.');
    const fixture = createRouteRuntimeFixture({
      beforeRender: () => {
        throw beforeRenderError;
      },
    });

    await expect(fixture.runtime.loader(createLoaderArgs())).rejects.toThrow(
      'beforeRender провайдера завершился с ошибкой.',
    );

    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'module.activation-failed',
        failure: expect.objectContaining({
          cause: beforeRenderError,
          source: expect.objectContaining({
            operation: 'beforeRender',
            owner: expect.objectContaining({ kind: 'module' }),
            participant: expect.objectContaining({ kind: 'provider' }),
          }),
        }),
      }),
    );
  });

  it('reports module provider setup errors with provider phase code', async () => {
    const setupError = new Error('setup module-провайдера завершился с ошибкой.');
    const fixture = createRouteRuntimeFixture({
      setup: () => {
        throw setupError;
      },
    });

    await expect(fixture.runtime.loader(createLoaderArgs())).rejects.toThrow(
      'setup module-провайдера завершился с ошибкой.',
    );

    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'module.activation-failed',
        failure: expect.objectContaining({
          cause: setupError,
          source: expect.objectContaining({
            operation: 'setup',
            owner: expect.objectContaining({ kind: 'module' }),
            participant: expect.objectContaining({ kind: 'provider' }),
          }),
        }),
      }),
    );
  });

  it('reports module provider dispose errors with provider phase code', async () => {
    const disposeError = new Error('Dispose провайдера завершился с ошибкой.');
    const fixture = createRouteRuntimeFixture({
      dispose: () => {
        throw disposeError;
      },
    });

    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.dispose();

    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'cleanup.contained',
        failure: expect.objectContaining({ cause: disposeError }),
        ownerState: 'disposing',
      }),
    );
  });

  it('loads active frame providers before route loader resolves', async () => {
    const frameProviderDeferred = createDeferred<void>();
    const frameProviderBeforeRender = vi.fn(async (context: RuntimeProviderContextInterface) => {
      expect(context.phase).toBe('beforeRender');
      expect(context.scope).toBeInstanceOf(FrameScope);
      await frameProviderDeferred.promise;
    });
    const fixture = createRouteRuntimeFixture({
      frameProviderBeforeRender,
      frames: [TestFrame],
      routePathname: '/route',
    });
    let isResolved = false;
    const loaderPromise = fixture.runtime.loader(createLoaderArgs('#test-frame')).then(() => {
      isResolved = true;
    });

    await vi.waitFor(() => {
      expect(frameProviderBeforeRender).toHaveBeenCalledTimes(1);
    });
    expect(isResolved).toBe(false);

    frameProviderDeferred.resolve();
    await loaderPromise;

    expect(fixture.routerRuntime.getPreparedFrameRuntime(TestFrame, 'test-frame:"null"')?.getSnapshot().phase).toBe(
      'ready',
    );
  });

  it('does not reload existing active frame runtime during route revalidation', async () => {
    const frameProviderBeforeRender = vi.fn();
    const fixture = createRouteRuntimeFixture({
      frameProviderBeforeRender,
      frames: [TestFrame],
      routePathname: '/route',
    });

    await fixture.runtime.loader(createLoaderArgs('#test-frame'));
    await fixture.runtime.loader(createLoaderArgs('#test-frame'));

    expect(frameProviderBeforeRender).toHaveBeenCalledTimes(1);
    expect(fixture.routerRuntime.getPreparedFrameRuntime(TestFrame, 'test-frame:"null"')?.getSnapshot().phase).toBe(
      'ready',
    );
  });

  it('does not preload inherited frame runtime from a non-current route pathname', async () => {
    const frameProviderBeforeRender = vi.fn();
    const fixture = createRouteRuntimeFixture({
      frameProviderBeforeRender,
      frames: [TestFrame],
      routePathname: '/parent',
    });

    await fixture.runtime.loader(createLoaderArgs('/child#test-frame'));

    expect(frameProviderBeforeRender).not.toHaveBeenCalled();
    expect(fixture.routerRuntime.getPreparedFrameRuntime(TestFrame, 'test-frame:"null"')).toBeNull();
  });

  it('redirects default route before running route providers', async () => {
    const routeCanMatch = vi.fn<() => PolicyResult>(() => ({ type: 'fail' }));
    const routeProviderBeforeRender = vi.fn((context: RuntimeProviderContextInterface) => {
      return () => {
        void context;
      };
    });
    const fixture = createRouteRuntimeFixture({
      routeCanMatch,
      routeDefaultTo: '/terminals',
      routePathname: '/',
      routeProviderBeforeRender,
      routeProviders: [TestRouteProvider],
    });

    await expect(fixture.runtime.loader(createLoaderArgs(''))).rejects.toMatchObject({
      status: 302,
    });

    expect(routeProviderBeforeRender).not.toHaveBeenCalled();
    expect(routeCanMatch).not.toHaveBeenCalled();
  });

  it('keeps frame load errors inside prepared frame runtime', async () => {
    const frameError = new Error('beforeRender фрейма завершился с ошибкой.');
    const fixture = createRouteRuntimeFixture({
      frameProviderBeforeRender: () => {
        throw frameError;
      },
      frames: [TestFrame],
      routePathname: '/route',
    });

    await expect(fixture.runtime.loader(createLoaderArgs('#test-frame'))).resolves.toBeDefined();

    const runtime = fixture.routerRuntime.getPreparedFrameRuntime(TestFrame, 'test-frame:"null"');

    expect(runtime?.getSnapshot()).toEqual({
      error: frameError,
      phase: 'failed',
    });
    expect(runtime?.getActiveRuntimeOrNull()).not.toBeNull();
    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'frame.failed',
        failure: expect.objectContaining({
          cause: frameError,
          source: expect.objectContaining({
            operation: 'beforeRender',
            owner: expect.objectContaining({ kind: 'frame' }),
            participant: expect.objectContaining({ kind: 'provider' }),
          }),
        }),
      }),
    );
  });

  it('redirects through policies when session changes during frame load', async () => {
    const session = new TestSessionRuntimeState();
    const frameError = new Error('Сессия фрейма устарела.');

    session.setAuthenticated();

    const fixture = createRouteRuntimeFixture({
      frameProviderBeforeRender: () => {
        session.setAnonymous();
        throw frameError;
      },
      frames: [TestFrame],
      routeCanMatch: () => (session.phase === 'authenticated' ? { type: 'pass' } : { type: 'fail' }),
      routePolicyOnFail: Router.redirectTo('/sign-in', {
        replace: true,
        saveCurrentLocation: true,
      }),
      routePathname: '/route',
      session,
    });

    const error = await catchRedirect(fixture.runtime.loader(createLoaderArgs("#test-frame(id='42')")));

    expect(error.headers.get('Location')).toBe('/sign-in');
    expect(fixture.reportFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({ cause: frameError }),
      }),
    );
  });

  it('redirects through policies when session changes during module loader', async () => {
    const session = new TestSessionRuntimeState();
    const loaderError = new Error('Сессия модуля устарела.');

    session.setAuthenticated();

    const fixture = createRouteRuntimeFixture({
      loader: () => {
        session.setAnonymous();
        throw loaderError;
      },
      routeCanMatch: () => (session.phase === 'authenticated' ? { type: 'pass' } : { type: 'fail' }),
      routePolicyOnFail: Router.redirectTo('/sign-in', {
        replace: true,
        saveCurrentLocation: true,
      }),
      session,
    });

    const error = await catchRedirect(fixture.runtime.loader(createLoaderArgs('/terminals')));

    expect(error.headers.get('Location')).toBe('/sign-in');
  });

  it('syncs request location before module controller loaders', async () => {
    let loaderSearch = '';
    const fixture = createRouteRuntimeFixture({
      loader: (_args, locationService) => {
        loaderSearch = locationService.location?.search ?? '';
      },
    });

    await fixture.runtime.loader(createLoaderArgs('?status=Ok&search=terminal'));

    expect(loaderSearch).toBe('?status=Ok&search=terminal');
  });

  it('syncs request location without router base path', async () => {
    let loaderPathname = '';
    const fixture = createRouteRuntimeFixture({
      basePath: '/terminals-management',
      loader: (_args, locationService) => {
        loaderPathname = locationService.location?.pathname ?? '';
      },
    });

    await fixture.runtime.loader(createLoaderArgs('/terminals-management/users'));

    expect(loaderPathname).toBe('/users');
  });

  it('saves current location before policy redirect', async () => {
    const fixture = createRouteRuntimeFixture({
      basePath: '/terminals-management',
      routeCanMatch: () => ({ reason: 'anonymous', type: 'fail' }),
      routePolicyOnFail: Router.redirectTo('/sign-in', {
        replace: true,
        saveCurrentLocation: true,
      }),
    });

    const error = await catchRedirect(
      fixture.runtime.loader(createLoaderArgs("/terminals-management/terminals?status=active#terminal(id='1')")),
    );

    expect(error.headers.get('Location')).toBe('/sign-in');
    expect(
      fixture.applicationScope.get(NavigationContinuationServiceInterface).consume({
        basePath: '/terminals-management',
      }),
    ).toBe("/terminals?status=active#terminal(id='1')");
  });

  it('redirects to saved location from policy', async () => {
    const fixture = createRouteRuntimeFixture({
      basePath: '/terminals-management',
      routeCanMatch: () => ({ reason: 'authenticated', type: 'fail' }),
      routePolicyOnFail: Router.redirectToSaved({
        fallback: '/',
        replace: true,
      }),
    });

    fixture.applicationScope
      .get(NavigationContinuationServiceInterface)
      .capture("/terminals-management/terminals/registrations#registrationReview(id='44')", {
        basePath: '/terminals-management',
      });

    const error = await catchRedirect(fixture.runtime.loader(createLoaderArgs('/terminals-management/sign-in')));

    expect(error.headers.get('Location')).toBe("/terminals/registrations#registrationReview(id='44')");
  });

  it('redirects first available default route by testing child canMatch without handlers', async () => {
    const deniedPolicy = vi.fn((): PolicyResult => ({ reason: 'denied', type: 'fail' }));
    const allowedPolicy = vi.fn((): PolicyResult => ({ type: 'pass' }));

    FirstAvailableDeniedPolicy.executeHandler = deniedPolicy;
    FirstAvailableAllowedPolicy.executeHandler = allowedPolicy;

    const fixture = createRouteRuntimeFixture({
      route: new Route({
        defaultTo: Router.firstAvailable(),
        routes: [
          new Route({
            canMatch: [
              {
                onFail: Router.redirectTo('/unexpected'),
                use: FirstAvailableDeniedPolicy,
              },
            ],
            load: async () => ({}),
            path: '/terminals',
          }),
          new Route({
            canMatch: [FirstAvailableAllowedPolicy],
            load: async () => ({}),
            path: '/employees',
          }),
        ],
      }),
      routePathname: '/',
    });

    const error = await catchRedirect(fixture.runtime.loader(createLoaderArgs('/')));

    expect(error.headers.get('Location')).toBe('/employees');
    expect(deniedPolicy).toHaveBeenCalledTimes(1);
    expect(allowedPolicy).toHaveBeenCalledTimes(1);
  });

  it('returns forbidden when first available default route cannot find a matching child', async () => {
    FirstAvailableDeniedPolicy.executeHandler = vi.fn((): PolicyResult => ({ reason: 'denied', type: 'fail' }));

    const fixture = createRouteRuntimeFixture({
      route: new Route({
        defaultTo: Router.firstAvailable(),
        routes: [
          new Route({
            canMatch: [FirstAvailableDeniedPolicy],
            load: async () => ({}),
            path: '/terminals',
          }),
        ],
      }),
      routePathname: '/',
    });

    await expect(fixture.runtime.loader(createLoaderArgs('/'))).rejects.toMatchObject({
      status: 403,
    });
  });

  it('does not inspect children of a denied first available route group', async () => {
    const deniedPolicy = vi.fn((): PolicyResult => ({ reason: 'denied', type: 'fail' }));
    const nestedAllowedPolicy = vi.fn((): PolicyResult => ({ type: 'pass' }));
    const nextAllowedPolicy = vi.fn((): PolicyResult => ({ type: 'pass' }));

    FirstAvailableDeniedPolicy.executeHandler = deniedPolicy;
    FirstAvailableAllowedPolicy.executeHandler = nestedAllowedPolicy;
    SecondFirstAvailableAllowedPolicy.executeHandler = nextAllowedPolicy;

    const fixture = createRouteRuntimeFixture({
      route: new Route({
        defaultTo: Router.firstAvailable(),
        routes: [
          new Route({
            canMatch: [FirstAvailableDeniedPolicy],
            path: '/terminals',
            routes: [
              new Route({
                canMatch: [FirstAvailableAllowedPolicy],
                load: async () => ({}),
                path: '/registrations',
              }),
            ],
          }),
          new Route({
            canMatch: [SecondFirstAvailableAllowedPolicy],
            load: async () => ({}),
            path: '/employees',
          }),
        ],
      }),
      routePathname: '/',
    });

    const error = await catchRedirect(fixture.runtime.loader(createLoaderArgs('/')));

    expect(error.headers.get('Location')).toBe('/employees');
    expect(deniedPolicy).toHaveBeenCalledTimes(1);
    expect(nestedAllowedPolicy).not.toHaveBeenCalled();
    expect(nextAllowedPolicy).toHaveBeenCalledTimes(1);
  });

  it('runs route providers in route scope', async () => {
    const routeProviderDispose = vi.fn();
    const routeProviderBeforeRender = vi.fn((context: RuntimeProviderContextInterface) => {
      expect(context.phase).toBe('beforeRender');
      expect(context.scope).toBeInstanceOf(RouteScope);

      return () => routeProviderDispose();
    });
    const fixture = createRouteRuntimeFixture({
      routeProviderBeforeRender,
      routeProviders: [TestRouteProvider],
    });

    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.dispose();

    expect(routeProviderBeforeRender).toHaveBeenCalledTimes(1);
    expect(routeProviderDispose).toHaveBeenCalledTimes(1);
  });

  it('runs route provider setup once and disposes its cleanup at the route boundary', async () => {
    const routeProviderDispose = vi.fn();
    const routeProviderSetup = vi.fn((context: RuntimeProviderContextInterface) => {
      expect(context.phase).toBe('setup');
      expect(context.scope).toBeInstanceOf(RouteScope);

      return () => routeProviderDispose();
    });
    const fixture = createRouteRuntimeFixture({
      routeProviderSetup,
      routeProviders: [TestRouteProvider],
    });

    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.dispose();

    expect(routeProviderSetup).toHaveBeenCalledTimes(1);
    expect(routeProviderDispose).toHaveBeenCalledTimes(1);
  });

  it('creates a new route provider pipeline when the persistent route runtime is activated again', async () => {
    const routeProviderDispose = vi.fn();
    const routeProviderSetup = vi.fn(() => {
      return () => routeProviderDispose();
    });
    const fixture = createRouteRuntimeFixture({
      routeProviderSetup,
      routeProviders: [TestRouteProvider],
    });

    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.dispose();
    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.dispose();

    expect(routeProviderSetup).toHaveBeenCalledTimes(2);
    expect(routeProviderDispose).toHaveBeenCalledTimes(2);
  });

  it('runs layout providers in route scope', async () => {
    const layoutProviderDispose = vi.fn();
    const layoutProviderBeforeRender = vi.fn((context: RuntimeProviderContextInterface) => {
      expect(context.phase).toBe('beforeRender');
      expect(context.scope).toBeInstanceOf(RouteScope);

      return () => layoutProviderDispose();
    });

    TestLayoutProvider.beforeRenderHandler = layoutProviderBeforeRender;

    const fixture = createRouteRuntimeFixture({
      layouts: [TestLayout],
    });

    await fixture.runtime.loader(createLoaderArgs());
    await fixture.runtime.dispose();

    expect(layoutProviderBeforeRender).toHaveBeenCalledTimes(1);
    expect(layoutProviderDispose).toHaveBeenCalledTimes(1);
  });
});

interface RouteRuntimeFixtureOptions {
  readonly beforeRender?: (context: RuntimeProviderContextInterface) => void | Promise<void>;
  readonly dispose?: () => void | Promise<void>;
  readonly frameProviderBeforeRender?: (context: RuntimeProviderContextInterface) => void | Promise<void>;
  readonly routePolicyOnFail?: ReturnType<typeof Router.redirectTo>;
  readonly basePath?: string;
  readonly frames?: readonly FrameConstructor[];
  readonly loader?: (
    args: ControllerLoaderArgs,
    locationService: LocationServiceInterface,
  ) => unknown | Promise<unknown>;
  readonly layouts?: readonly LayoutConstructor[];
  readonly route?: Route;
  readonly routeDefaultTo?: RouteDefaultTo;
  readonly routeCanMatch?: () => PolicyResult;
  readonly routePathname?: string;
  readonly routeProviderBeforeRender?: (
    context: RuntimeProviderContextInterface,
  ) => RuntimeProviderResult | Promise<RuntimeProviderResult>;
  readonly routeProviderSetup?: (
    context: RuntimeProviderContextInterface,
  ) => RuntimeProviderResult | Promise<RuntimeProviderResult>;
  readonly routeProviders?: readonly DependencyToken<RuntimeProviderInterface>[];
  readonly session?: TestSessionRuntimeState;
  readonly setup?: (context: RuntimeProviderContextInterface) => void | Promise<void>;
}

interface RouteRuntimeFixture {
  readonly applicationScope: ApplicationScope;
  readonly reportFailure: MockInstance;
  readonly routerRuntime: RouterRuntime;
  readonly runtime: RouteRuntime;
}

const createRouteRuntimeFixture = (options: RouteRuntimeFixtureOptions = {}): RouteRuntimeFixture => {
  const beforeRender = vi.fn(options.beforeRender ?? (() => {}));
  const dispose = vi.fn(options.dispose ?? (() => {}));
  const setup = vi.fn(options.setup ?? (() => {}));
  const frameProviderBeforeRender = vi.fn(options.frameProviderBeforeRender ?? (() => {}));
  const routeCanMatch = vi.fn(options.routeCanMatch ?? (() => ({ type: 'pass' as const })));

  TestFrameProvider.beforeRenderHandler = frameProviderBeforeRender;
  TestRouteProvider.beforeRenderHandler = vi.fn(options.routeProviderBeforeRender ?? (() => () => {}));
  TestRouteProvider.setupHandler = vi.fn(options.routeProviderSetup ?? (() => {}));

  abstract class TestControllerInterface implements ControllerInterface {
    abstract loader(args: ControllerLoaderArgs): unknown | Promise<unknown>;
  }

  @Controller()
  class TestController extends TestControllerInterface {
    constructor(
      @Inject(LocationServiceInterface)
      private readonly locationService: LocationServiceInterface,
    ) {
      super();
    }

    loader(args: ControllerLoaderArgs): unknown | Promise<unknown> {
      return options.loader?.(args, this.locationService);
    }
  }

  @Provider()
  class TestProvider extends RuntimeProviderInterface {
    setup(context: RuntimeProviderContextInterface): void | Promise<void> {
      return setup(context);
    }

    beforeRender(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult> {
      beforeRender(context);

      return () => dispose();
    }
  }

  TestRoutePolicy.executeHandler = routeCanMatch;

  class TestBindings extends BindingModuleInterface {
    register(registry: BindingRegistryInterface): void {
      registry.bind(TestControllerInterface).to(TestController).inSingletonScope();
    }
  }

  const View = (): null => null;

  @UseBindings(TestBindings)
  @Module({
    providers: [TestProvider],
    view: View,
  })
  class TestModule {}

  const app = new TestApplicationController();
  const route = options.route ?? createFixtureRoute(options, async () => ({ TestModule }));
  const applicationScope = new ApplicationScope();
  const reportFailure = vi.spyOn(applicationScope.get(RuntimeFailureReporterInterface), 'report').mockResolvedValue();
  const loaderPolicies: RoutePolicyDeclarations =
    options.routePolicyOnFail === undefined
      ? EMPTY_ROUTE_POLICY_DECLARATIONS
      : {
          ...EMPTY_ROUTE_POLICY_DECLARATIONS,
          canMatch: [
            {
              onFail: options.routePolicyOnFail,
              use: TestRoutePolicy,
            },
          ],
        };

  const routerRuntime = new RouterRuntime();

  applicationScope.bindRouterRuntime(routerRuntime);
  applicationScope.activate(TestApplicationOwner);

  const runtime = new RouteRuntime(
    route,
    app,
    options.session ?? new TestSessionRuntimeState(),
    applicationScope,
    loaderPolicies,
    EMPTY_ROUTE_POLICY_DECLARATIONS,
    options.frames,
    options.routePathname,
    options.basePath,
  );

  return {
    applicationScope,
    reportFailure,
    routerRuntime,
    runtime,
  };
};

const createFixtureRoute = (
  options: RouteRuntimeFixtureOptions,
  load: () => Promise<Record<string, unknown>>,
): Route => {
  if (options.routeDefaultTo === undefined) {
    return new Route({
      layouts: options.layouts,
      load,
      providers: options.routeProviders,
    });
  }

  return new Route({
    defaultTo: options.routeDefaultTo,
    canMatch: [{ use: TestRoutePolicy, onFail: Router.redirectTo('/sign-in') }],
    layouts: options.layouts,
    providers: options.routeProviders,
    routes: [
      new Route({
        load,
        path: '/terminals',
      }),
    ],
  });
};

const createLoaderArgs = (pathOrHash = ''): LoaderFunctionArgs => {
  const path = pathOrHash.startsWith('#') || pathOrHash.startsWith('?') ? `/route${pathOrHash}` : pathOrHash || '/';

  return {
    params: {},
    request: new Request(`https://tiyn-app.test${path}`),
  } as LoaderFunctionArgs;
};

const catchRedirect = async (promise: Promise<unknown>): Promise<Response> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }

  throw new Error('Ожидался redirect из loader маршрута.');
};

const TestFrameView = (): null => null;

@Provider()
class TestFrameProvider extends RuntimeProviderInterface {
  static beforeRenderHandler: (context: RuntimeProviderContextInterface) => void | Promise<void> = () => {};

  beforeRender(context: RuntimeProviderContextInterface): void | Promise<void> {
    return TestFrameProvider.beforeRenderHandler(context);
  }
}

@Frame({
  providers: [TestFrameProvider],
  source: HashFrameSource.create('test-frame'),
  view: TestFrameView,
})
class TestFrame extends FrameDefinition {}

class TestApplicationBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterServiceBindings().register(registry);
    new FrameBindings().register(registry);
    registry.bind(TestRoutePolicy).toSelf().inSingletonScope();
    registry.bind(FirstAvailableAllowedPolicy).toSelf().inSingletonScope();
    registry.bind(SecondFirstAvailableAllowedPolicy).toSelf().inSingletonScope();
    registry.bind(FirstAvailableDeniedPolicy).toSelf().inSingletonScope();
  }
}

@UseBindings(TestApplicationBindings)
class TestApplicationOwner {}

@Provider()
class TestLayoutProvider extends RuntimeProviderInterface {
  static beforeRenderHandler: (
    context: RuntimeProviderContextInterface,
  ) => RuntimeProviderResult | Promise<RuntimeProviderResult> = () => () => {};

  beforeRender(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult> {
    return TestLayoutProvider.beforeRenderHandler(context);
  }
}

const TestLayoutView = (): null => null;

@Layout({
  providers: [TestLayoutProvider],
  view: TestLayoutView,
})
class TestLayout {}

@Injectable()
class TestRoutePolicy extends RoutePolicyInterface {
  static executeHandler: () => PolicyResult = () => ({ type: 'pass' });

  execute(): PolicyResult {
    return TestRoutePolicy.executeHandler();
  }
}

@Injectable()
class FirstAvailableAllowedPolicy extends RoutePolicyInterface {
  static executeHandler: () => PolicyResult = () => ({ type: 'pass' });

  execute(): PolicyResult {
    return FirstAvailableAllowedPolicy.executeHandler();
  }
}

@Injectable()
class FirstAvailableDeniedPolicy extends RoutePolicyInterface {
  static executeHandler: () => PolicyResult = () => ({ reason: 'denied', type: 'fail' });

  execute(): PolicyResult {
    return FirstAvailableDeniedPolicy.executeHandler();
  }
}

@Injectable()
class SecondFirstAvailableAllowedPolicy extends RoutePolicyInterface {
  static executeHandler: () => PolicyResult = () => ({ type: 'pass' });

  execute(): PolicyResult {
    return SecondFirstAvailableAllowedPolicy.executeHandler();
  }
}

@Provider()
class TestRouteProvider extends RuntimeProviderInterface {
  static setupHandler: (
    context: RuntimeProviderContextInterface,
  ) => RuntimeProviderResult | Promise<RuntimeProviderResult> = () => {};
  static beforeRenderHandler: (
    context: RuntimeProviderContextInterface,
  ) => RuntimeProviderResult | Promise<RuntimeProviderResult> = () => () => {};

  setup(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult> {
    return TestRouteProvider.setupHandler(context);
  }

  beforeRender(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult> {
    return TestRouteProvider.beforeRenderHandler(context);
  }
}

const EMPTY_ROUTE_POLICY_DECLARATIONS: RoutePolicyDeclarations = {
  canAction: [],
  canActivate: [],
  canMatch: [],
};

class TestApplicationController extends ApplicationControllerInterface {
  readonly lifecycle: ApplicationLifecycleSnapshot = {
    error: null,
    phase: 'ready',
  };
}

class TestSessionRuntimeState extends SessionRuntimeStateInterface {
  private currentRevision = 0;
  private currentPhase: SessionRuntimePhase = 'unknown';

  get phase(): SessionRuntimePhase {
    return this.currentPhase;
  }

  get revision(): number {
    return this.currentRevision;
  }

  setAnonymous(): void {
    this.setPhase('anonymous');
  }

  setAuthenticated(): void {
    this.setPhase('authenticated');
  }

  setUnknown(): void {
    this.setPhase('unknown');
  }

  subscribe(_listener: SessionRuntimeStateListener): () => void {
    return () => {};
  }

  private setPhase(phase: SessionRuntimePhase): void {
    if (this.currentPhase === phase) {
      return;
    }

    this.currentPhase = phase;
    this.currentRevision += 1;
  }
}

interface Deferred<TValue = void> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value?: TValue) => void;
}

function createDeferred<TValue = void>(): Deferred<TValue> {
  let resolve: Deferred<TValue>['resolve'] = () => {};
  const promise = new Promise<TValue>((promiseResolve) => {
    resolve = promiseResolve as Deferred<TValue>['resolve'];
  });

  return {
    promise,
    resolve,
  };
}
