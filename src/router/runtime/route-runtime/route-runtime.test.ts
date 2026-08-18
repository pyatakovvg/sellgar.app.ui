import 'reflect-metadata';

import { redirect, replace } from 'react-router';
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
import { SessionRuntimeState, SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { ControllerArgs, WithParams, WithPayload, WithProps } from '../../../controller/contract/controller';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { Inject, Injectable } from '../../../di/injection/decorators';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { Module } from '../../../module/declaration/module';
import type { PolicyResult } from '../../../policy/contract/policy-result';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeFailureReporterInterface } from '../../../runtime/failure';
import { RuntimeOperationCoordinator } from '../../../runtime/operation';
import { RuntimeExceptionServiceInterface } from '../../../runtime/exception';
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
import { parseHashToObject } from '../../utils/hash-utils';
import { parseSearchParams } from '../../utils/search-utils';

import { isRouteRuntimeNavigationException, RouteRuntime, type RouteRuntimeLoadContext } from './';

describe('RouteRuntime', () => {
  it('выполняет module action напрямую через route runtime без сериализации payload', async () => {
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    const payload = { file, name: 'Товар' };
    const actionResult = { uuid: 'product:1' };
    const fixture = createRouteRuntimeFixture({
      action: (args) => {
        expect(args.payload).toBe(payload);
        expect((args.payload as typeof payload).file).toBe(file);

        return actionResult;
      },
    });

    await fixture.runtime.loader(createLoaderArgs());
    fixture.runtime.commit();

    const result = await fixture.runtime.action(fixture.controllerToken, payload);

    expect(fixture.action).toHaveBeenCalledTimes(1);
    expect(result).toBe(actionResult);
  });

  it('сохраняет ошибку module action в runtime submit state', async () => {
    const actionError = new Error('Action завершился с ошибкой.');
    const fixture = createRouteRuntimeFixture({
      action: () => {
        throw actionError;
      },
    });

    await fixture.runtime.loader(createLoaderArgs());
    fixture.runtime.commit();

    const moduleRuntime = fixture.runtime.getModuleRuntime();
    await expect(fixture.runtime.action(fixture.controllerToken, { name: 'Товар' })).resolves.toBeUndefined();

    expect(moduleRuntime.getActionState(fixture.controllerToken)).toEqual({
      data: undefined,
      error: actionError,
      inProcess: false,
    });
    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'action.failed',
        failure: expect.objectContaining({ cause: actionError }),
      }),
    );
  });

  it('переводит module в failed при явной runtime exception из action', async () => {
    const error = new Error('Критическая ошибка модуля.');
    const fixture = createRouteRuntimeFixture({ runtimeException: error });

    await fixture.runtime.loader(createLoaderArgs());
    fixture.runtime.commit();

    await expect(fixture.runtime.action(fixture.controllerToken, {})).resolves.toBeUndefined();

    const snapshot = fixture.runtime.getModuleRuntime().getSnapshot();

    expect(snapshot).toEqual({
      error,
      phase: 'failed',
    });
    expect(fixture.runtime.getModuleRuntime().getSnapshot()).toBe(snapshot);
    expect(fixture.runtime.getActionState(fixture.controllerToken).error).toBeUndefined();
    expect(fixture.reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'module.failed',
        failure: expect.objectContaining({
          cause: error,
          source: expect.objectContaining({
            operation: 'action',
            participant: { kind: 'controller', token: fixture.controllerToken },
          }),
        }),
      }),
    );
  });

  it('завершает module action при изменении session и не запускает policy локально повторно', async () => {
    const session = new SessionRuntimeState();
    const routeCanMatch = vi.fn((): PolicyResult =>
      session.phase === 'anonymous' ? { type: 'pass' } : { reason: 'authenticated', type: 'fail' },
    );
    const fixture = createRouteRuntimeFixture({
      action: () => {
        session.setAuthenticated();
      },
      routeCanMatch,
      actionPolicyOnFail: Router.redirectTo('/', { replace: true }),
      session,
    });

    session.setAnonymous();

    await fixture.runtime.loader(createLoaderArgs());
    fixture.runtime.commit();
    const refresh = vi.fn();

    fixture.applicationScope.get(RuntimeOperationCoordinator).attachRefresh(refresh);

    await expect(fixture.runtime.action(fixture.controllerToken, {})).resolves.toBeUndefined();

    expect(routeCanMatch).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('запускает одну refresh wave после изменения session в произвольном методе контроллера', async () => {
    const session = new SessionRuntimeState();
    const directMethod = vi.fn(() => {
      session.setAuthenticated();
      return 'authenticated';
    });
    const fixture = createRouteRuntimeFixture({ directMethod, session });

    session.setAnonymous();
    await fixture.runtime.loader(createLoaderArgs());
    fixture.runtime.commit();

    const refresh = vi.fn();
    fixture.applicationScope.get(RuntimeOperationCoordinator).attachRefresh(refresh);

    expect(fixture.runtime.invoke(fixture.controllerToken, 'directMethod', [])).toBe('authenticated');

    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledOnce();
    });
  });

  it('вызывает метод controller из подготовленного view module до commit', async () => {
    const directMethod = vi.fn(() => 'pending-view');
    const fixture = createRouteRuntimeFixture({ directMethod });

    await fixture.runtime.loader(createLoaderArgs());

    expect(fixture.runtime.invoke(fixture.controllerToken, 'directMethod', [])).toBe('pending-view');
    expect(directMethod).toHaveBeenCalledOnce();
  });

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
      decision: { replace: true, to: '/terminals', type: 'redirect' },
    });

    expect(routeProviderBeforeRender).not.toHaveBeenCalled();
    expect(routeCanMatch).not.toHaveBeenCalled();
  });

  it('interrupts module loader without locally rerunning policies when session changes', async () => {
    const session = new TestSessionRuntimeState();
    const loaderError = new Error('Сессия модуля устарела.');
    const routeCanMatch = vi.fn((): PolicyResult =>
      session.phase === 'authenticated' ? { type: 'pass' } : { type: 'fail' },
    );

    session.setAuthenticated();

    const fixture = createRouteRuntimeFixture({
      loader: () => {
        session.setAnonymous();
        throw loaderError;
      },
      routeCanMatch,
      routePolicyOnFail: Router.redirectTo('/sign-in', {
        replace: true,
        saveCurrentLocation: true,
      }),
      session,
    });

    await expect(fixture.runtime.loader(createLoaderArgs('/terminals'))).resolves.toBeNull();
    expect(fixture.reportFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({
        failure: expect.objectContaining({ cause: loaderError }),
      }),
    );
    expect(routeCanMatch).toHaveBeenCalledOnce();
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

    await fixture.runtime.loader(createLoaderArgs('/terminals-management/users', '/terminals-management'));

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
      fixture.runtime.loader(
        createLoaderArgs("/terminals-management/terminals?status=active#terminal(id='1')", '/terminals-management'),
      ),
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

    const error = await catchRedirect(
      fixture.runtime.loader(createLoaderArgs('/terminals-management/sign-in', '/terminals-management')),
    );

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

  it('redirects a nested first available route relative to its group pathname', async () => {
    const fixture = createRouteRuntimeFixture({
      route: new Route({
        defaultTo: Router.firstAvailable(),
        routes: [
          new Route({
            load: async () => ({}),
            path: '/registrations',
          }),
        ],
      }),
      routePathname: '/terminals',
    });

    const error = await catchRedirect(fixture.runtime.loader(createLoaderArgs('/terminals')));

    expect(error.headers.get('Location')).toBe('/terminals/registrations');
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
      decision: { type: 'forbidden' },
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
      expect(context).not.toHaveProperty('scope');

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
      expect(context).not.toHaveProperty('scope');

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
      expect(context).not.toHaveProperty('scope');

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

type TestControllerContext = ControllerArgs<WithParams<Record<string, string | undefined>, WithProps<object>>>;
type TestControllerActionContext = ControllerArgs<
  WithPayload<unknown, WithParams<Record<string, string | undefined>, WithProps<object>>>
>;

interface RouteRuntimeFixtureOptions {
  readonly action?: (args: TestControllerActionContext) => unknown | Promise<unknown>;
  readonly actionPolicyOnFail?: ReturnType<typeof Router.redirectTo>;
  readonly beforeRender?: (context: RuntimeProviderContextInterface) => void | Promise<void>;
  readonly dispose?: () => void | Promise<void>;
  readonly directMethod?: () => unknown;
  readonly routePolicyOnFail?: ReturnType<typeof Router.redirectTo>;
  readonly basePath?: string;
  readonly loader?: (
    args: TestControllerContext,
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
  readonly runtimeException?: Error;
  readonly session?: SessionRuntimeStateInterface;
  readonly setup?: (context: RuntimeProviderContextInterface) => void | Promise<void>;
}

interface RouteRuntimeFixture {
  readonly action: ReturnType<typeof vi.fn>;
  readonly applicationScope: ApplicationScope;
  readonly controllerToken: DependencyToken<unknown>;
  readonly reportFailure: MockInstance;
  readonly routerRuntime: RouterRuntime;
  readonly runtime: RouteRuntime;
}

const createRouteRuntimeFixture = (options: RouteRuntimeFixtureOptions = {}): RouteRuntimeFixture => {
  const action = vi.fn(options.action ?? (() => undefined));
  const beforeRender = vi.fn(options.beforeRender ?? (() => {}));
  const dispose = vi.fn(options.dispose ?? (() => {}));
  const setup = vi.fn(options.setup ?? (() => {}));
  const routeCanMatch = vi.fn(options.routeCanMatch ?? (() => ({ type: 'pass' as const })));

  TestRouteProvider.beforeRenderHandler = vi.fn(options.routeProviderBeforeRender ?? (() => () => {}));
  TestRouteProvider.setupHandler = vi.fn(options.routeProviderSetup ?? (() => {}));

  abstract class TestControllerInterface {
    abstract action(args: TestControllerActionContext): unknown | Promise<unknown>;

    abstract loader(args: TestControllerContext): unknown | Promise<unknown>;

    abstract directMethod(): unknown;
  }

  @Controller()
  class TestController implements TestControllerInterface {
    constructor(
      @Inject(LocationServiceInterface)
      private readonly locationService: LocationServiceInterface,
      @Inject(RuntimeExceptionServiceInterface)
      private readonly runtimeExceptionService: RuntimeExceptionServiceInterface,
    ) {}

    action(args: TestControllerActionContext): unknown | Promise<unknown> {
      if (options.runtimeException) {
        this.runtimeExceptionService.raise(options.runtimeException);
      }

      return action(args);
    }

    loader(args: TestControllerContext): unknown | Promise<unknown> {
      return options.loader?.(args, this.locationService);
    }

    directMethod(): unknown {
      return options.directMethod?.();
    }
  }

  @Provider()
  class TestProvider implements RuntimeProviderInterface {
    setup(context: RuntimeProviderContextInterface): void | Promise<void> {
      return setup(context);
    }

    beforeRender(context: RuntimeProviderContextInterface): RuntimeProviderResult | Promise<RuntimeProviderResult> {
      beforeRender(context);

      return () => dispose();
    }
  }

  TestRoutePolicy.executeHandler = routeCanMatch;

  class TestBindings implements BindingModuleInterface {
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
  const actionPolicies: RoutePolicyDeclarations =
    options.actionPolicyOnFail === undefined
      ? EMPTY_ROUTE_POLICY_DECLARATIONS
      : {
          ...EMPTY_ROUTE_POLICY_DECLARATIONS,
          canMatch: [
            {
              onFail: options.actionPolicyOnFail,
              use: TestRoutePolicy,
            },
          ],
        };

  const routerRuntime = new RouterRuntime();
  const session = options.session ?? new TestSessionRuntimeState();

  applicationScope.bindRouterRuntime(routerRuntime);
  applicationScope.bindSession(session);
  applicationScope.activate(TestApplicationOwner);

  const runtime = new RouteRuntime(
    route,
    app,
    session,
    applicationScope,
    loaderPolicies,
    actionPolicies,
    options.routePathname,
    options.basePath,
  );

  return {
    action,
    applicationScope,
    controllerToken: TestControllerInterface,
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

const createLoaderArgs = (pathOrHash = '', basePath?: string): RouteRuntimeLoadContext => {
  const path = pathOrHash.startsWith('#') || pathOrHash.startsWith('?') ? `/route${pathOrHash}` : pathOrHash || '/';
  const url = new URL(`https://tiyn-app.test${path}`);
  const hash = url.hash;

  return {
    location: {
      hash,
      hashParams: parseHashToObject(hash),
      key: url.href,
      params: {},
      pathname: removeBasePath(url.pathname, basePath),
      search: url.search,
      searchParams: parseSearchParams(url.search),
      state: null,
    },
    signal: new AbortController().signal,
  };
};

const removeBasePath = (pathname: string, basePath: string | undefined): string => {
  if (!basePath || basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
};

const catchRedirect = async (promise: Promise<unknown>): Promise<Response> => {
  try {
    await promise;
  } catch (error) {
    if (isRouteRuntimeNavigationException(error)) {
      switch (error.decision.type) {
        case 'redirect':
          return error.decision.replace ? replace(error.decision.to) : redirect(error.decision.to);
        case 'forbidden':
          return new Response(null, { status: 403 });
        case 'not-found':
          return new Response(null, { status: 404 });
      }
    }

    throw error;
  }

  throw new Error('Ожидался redirect из loader маршрута.');
};

class TestApplicationBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterServiceBindings().register(registry);
    registry.bind(TestRoutePolicy).toSelf().inSingletonScope();
    registry.bind(FirstAvailableAllowedPolicy).toSelf().inSingletonScope();
    registry.bind(SecondFirstAvailableAllowedPolicy).toSelf().inSingletonScope();
    registry.bind(FirstAvailableDeniedPolicy).toSelf().inSingletonScope();
  }
}

@UseBindings(TestApplicationBindings)
class TestApplicationOwner {}

@Provider()
class TestLayoutProvider implements RuntimeProviderInterface {
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
class TestRouteProvider implements RuntimeProviderInterface {
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

class TestApplicationController implements ApplicationControllerInterface {
  readonly lifecycle: ApplicationLifecycleSnapshot = {
    error: null,
    phase: 'ready',
  };
}

class TestSessionRuntimeState implements SessionRuntimeStateInterface {
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
