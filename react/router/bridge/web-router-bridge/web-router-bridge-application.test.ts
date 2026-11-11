import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationConfig } from '../../../../core/application/config/application-config';
import type { ApplicationConfiguratorInterface } from '../../../../core/application/config/application-configurator';
import { Feature, type ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { Application } from '../../../../core/application/lifecycle/application';
import { SessionRuntimeStateInterface } from '../../../../core/application/session/session-runtime-state';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { NavigationBlockerBindings } from '../../../../core/features/navigation-blocker/binding/navigation-blocker-bindings';
import { NavigationBlockerServiceInterface } from '../../../../core/features/navigation-blocker/contract/navigation-blocker-service';
import { NavigationBlockerRuntimeInterface } from '../../../../core/features/navigation-blocker/runtime/navigation-blocker-runtime';
import { createModuleRuntimeDefinition } from '../../../../core/module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../../core/module/resolution/module-export-resolver';
import { Policy } from '../../../../core/policy/contract/policy';
import type { PolicyResult } from '../../../../core/policy/contract/policy-result';
import { param, segments } from '../../../../core/router/declaration/address';
import { getRouteDefinition, Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import { RoutePolicyInterface } from '../../../../core/router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../../core/router/runtime/route-runtime-context';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { createWebRouterBridge } from './web-router-bridge.ts';

class RootRoute {}
class CatalogRoute {}
class ListRoute {}
class CreateRoute {}
class OtherRoute {}
class SignInRoute {}
class InspectRoute {
  declare readonly id: string;
}
class TestModule {}

@Policy()
class PermissionPolicy extends RoutePolicyInterface {
  static allowed = true;

  execute(): PolicyResult {
    return PermissionPolicy.allowed ? { type: 'pass' } : { type: 'fail', reason: 'missing-permission' };
  }
}

@Policy()
class AuthenticatedPolicy extends RoutePolicyInterface {
  execute(context: RouteRuntimeContextInterface): PolicyResult {
    return context.session.phase === 'authenticated' ? { type: 'pass' } : { type: 'fail', reason: 'anonymous' };
  }
}

@Policy()
class AnonymousPolicy extends RoutePolicyInterface {
  execute(context: RouteRuntimeContextInterface): PolicyResult {
    return context.session.phase === 'authenticated' ? { type: 'fail', reason: 'authenticated' } : { type: 'pass' };
  }
}

@UseBindings(NavigationBlockerBindings)
@Feature()
class TestBlockerFeature implements ApplicationFeatureInterface {}

class TestModuleResolver implements ModuleExportResolverInterface<null> {
  resolve() {
    return createModuleRuntimeDefinition({ presentation: null, token: TestModule });
  }
}

class WebTestApplication extends Application<null> {
  constructor(
    readonly bridge: ReturnType<typeof createWebRouterBridge>,
    private readonly router: Router,
  ) {
    super(bridge, new ApplicationConfig(), new TestModuleResolver());
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get sessionState(): SessionRuntimeStateInterface {
    return this.getApplicationScope().get(SessionRuntimeStateInterface);
  }

  get activeToken() {
    return getRouteDefinition(this.getRouterRuntime().getActiveRouteRuntimes().at(-1)!.route).token;
  }

  get blocker(): NavigationBlockerServiceInterface {
    return this.getRouterRuntime()
      .getActiveRouteRuntimes()
      .at(-1)!
      .getRouteScope()
      .get(NavigationBlockerServiceInterface);
  }

  get blockerRuntime(): NavigationBlockerRuntimeInterface {
    return this.getApplicationScope().get(NavigationBlockerRuntimeInterface);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([TestBlockerFeature]);
    app.router(this.router);
  }
}

const apps: WebTestApplication[] = [];
const loadModule = async () => ({});
const currentUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

const start = async (router: Router, url: string): Promise<WebTestApplication> => {
  window.history.replaceState(null, '', url);
  const app = new WebTestApplication(createWebRouterBridge(), router);
  apps.push(app);
  app.compose();
  await app.initialize();
  return app;
};

const permissionRouter = (replace: boolean) =>
  new Router({
    routes: [
      new Route({
        address: segments('catalog'),
        load: loadModule,
        token: CatalogRoute,
        routing: [
          new Router({
            routes: [
              new Route({
                address: segments('services', 'create'),
                canMatch: [PermissionPolicy.configure().onFail(Router.redirectTo(CatalogRoute, { replace }))],
                load: loadModule,
                token: CreateRoute,
              }),
            ],
          }),
        ],
      }),
      new Route({ address: segments('other'), load: loadModule, token: OtherRoute }),
    ],
  });

describe('WebRouterBridge Application location commits', () => {
  beforeEach(() => {
    PermissionPolicy.allowed = true;
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.dispose()));
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it.each([false, true])('applies a module redirect after a denied direct frame link (replace=%s)', async (replace) => {
    PermissionPolicy.allowed = false;
    const app = await start(permissionRouter(replace), '/catalog?outer=one#services/create?inner=two');

    expect(app.activeToken).toBe(CatalogRoute);
    expect(currentUrl()).toBe('/catalog');
  });

  it.each([false, true])(
    'applies a policy redirect during Back without adding a browser entry (replace=%s)',
    async (replace) => {
      const app = await start(permissionRouter(replace), '/catalog?outer=one#services/create?inner=two');
      expect(app.activeToken).toBe(CreateRoute);
      await app.navigate.to(OtherRoute);
      PermissionPolicy.allowed = false;
      const length = window.history.length;
      const push = vi.spyOn(window.history, 'pushState');
      const commit = vi.spyOn(app.bridge, 'commit');

      await app.bridge.back();

      expect(app.activeToken).toBe(CatalogRoute);
      expect(currentUrl()).toBe('/catalog');
      expect(window.history).toHaveLength(length);
      expect(push).not.toHaveBeenCalled();
      expect(commit).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ locationAction: 'apply', source: 'external' }),
      );
    },
  );

  it('preserves an ordinary external location including its unmatched fragment and raw query encoding', async () => {
    const url = '/catalog?outer=%2f+one#foreign?inner=two';
    const app = await start(permissionRouter(true), url);

    expect(app.activeToken).toBe(CatalogRoute);
    expect(currentUrl()).toBe(url);
  });

  it('preserves the external URL when an addressless index Module completes the matched Route branch', async () => {
    const url = '/catalog?outer=%2f+one#foreign?inner=two';
    const app = await start(
      new Router({
        routes: [
          new Route({
            address: segments('catalog'),
            routes: [new Route({ load: loadModule, token: ListRoute })],
            token: CatalogRoute,
          }),
        ],
      }),
      url,
    );

    expect(app.activeToken).toBe(ListRoute);
    expect(currentUrl()).toBe(url);
  });

  it.each(['/catalog/missing?outer=one#services/create?inner=two', '/catalog#services/create/missing?inner=two'])(
    'preserves the attempted not-found URL %s',
    async (url) => {
      await start(permissionRouter(true), url);
      expect(currentUrl()).toBe(url);
    },
  );

  it('normalizes an external default route while preserving root query', async () => {
    const app = await start(
      new Router({
        routes: [
          new Route({
            address: segments('catalog'),
            defaultTo: ListRoute,
            routes: [new Route({ address: segments('list'), load: loadModule, token: ListRoute })],
            token: CatalogRoute,
          }),
        ],
      }),
      '/catalog?outer=one',
    );

    expect(app.activeToken).toBe(ListRoute);
    expect(currentUrl()).toBe('/catalog/list?outer=one');
  });

  it('normalizes root before resolving the pending frame address and its separate query', async () => {
    const app = await start(
      new Router({
        routes: [
          new Route({
            defaultTo: CatalogRoute,
            token: RootRoute,
            routes: [
              new Route({
                address: segments('catalog'),
                load: loadModule,
                token: CatalogRoute,
                routing: [
                  new Router({
                    routes: [
                      new Route({ address: segments('services', 'create'), load: loadModule, token: CreateRoute }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      '/?outer=one#services/create?inner=two',
    );

    expect(app.activeToken).toBe(CreateRoute);
    expect(currentUrl()).toBe('/catalog?outer=one#services/create?inner=two');
  });

  it.each([false, true])(
    'restores the saved authenticated frame including params and both query scopes (replace=%s)',
    async (replace) => {
      const app = await start(
        new Router({
          routes: [
            new Route({
              address: segments('sign-in'),
              canMatch: [AnonymousPolicy.configure().onFail(Router.redirectToSaved({ replace }))],
              load: loadModule,
              token: SignInRoute,
            }),
            new Route({
              address: segments('protected'),
              canMatch: [
                AuthenticatedPolicy.configure().onFail(
                  Router.redirectTo(SignInRoute, { replace, saveCurrentLocation: true }),
                ),
              ],
              load: loadModule,
              token: CatalogRoute,
              routing: [
                new Router({
                  routes: [
                    new Route({ address: segments('inspect', param('id')), load: loadModule, token: InspectRoute }),
                  ],
                }),
              ],
            }),
          ],
        }),
        '/protected?outer=one#inspect/item-42?inner=two',
      );
      expect(app.activeToken).toBe(SignInRoute);
      expect(currentUrl()).toBe('/sign-in');

      app.sessionState.setAuthenticated();

      await vi.waitFor(() => expect(app.activeToken).toBe(InspectRoute));
      expect(currentUrl()).toBe('/protected?outer=one#inspect/item-42?inner=two');
    },
  );

  it('rolls a blocked Back back to the committed URL without applying the denied target', async () => {
    const app = await start(permissionRouter(false), '/catalog#services/create?inner=two');
    await app.navigate.to(OtherRoute);
    PermissionPolicy.allowed = false;
    app.blocker.register(() => true);
    const commit = vi.spyOn(app.bridge, 'commit');
    const length = window.history.length;
    const back = app.bridge.back();

    await vi.waitFor(() => expect(app.blockerRuntime.getSnapshot()).not.toBeNull());
    await app.blockerRuntime.stay();
    await back;

    expect(app.activeToken).toBe(OtherRoute);
    expect(currentUrl()).toBe('/other');
    expect(window.history).toHaveLength(length);
    expect(commit).not.toHaveBeenCalled();
  });
});
