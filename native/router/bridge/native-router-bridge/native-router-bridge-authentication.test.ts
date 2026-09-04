import { describe, expect, it, vi } from 'vitest';

import type { ApplicationConfiguratorInterface } from '../../../../core/application/config/application-configurator';
import { ApplicationConfig } from '../../../../core/application/config/application-config';
import { Application } from '../../../../core/application/lifecycle/application';
import { RequestExecutorInterface } from '../../../../core/application/request/request-executor';
import { SessionRuntimeStateInterface } from '../../../../core/application/session/session-runtime-state';
import { UnauthorizedException } from '../../../../core/http/exception/http-exception';
import { createModuleRuntimeDefinition } from '../../../../core/module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../../core/module/resolution/module-export-resolver';
import { Policy } from '../../../../core/policy/contract/policy';
import type { PolicyResult } from '../../../../core/policy/contract/policy-result';
import { segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import { matchesNavigationRoute } from '../../../../core/router/runtime/navigation-state';
import { RoutePolicyInterface } from '../../../../core/router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../../core/router/runtime/route-runtime-context';
import type { RouterBridgeLocationInterface } from '../../../../core/router/bridge/router-bridge';
import type {
  NativeRouterTransportInterface,
  NativeRouterTransportListener,
} from '../../transport/native-router-transport';
import { createNativeRouterBridge, type NativeRouterBridge } from './native-router-bridge';

abstract class SignInRoute {}
abstract class ProtectedRoute {}
class TestModule {}

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

class TestApplication extends Application<null> {
  constructor(
    private readonly bridge: NativeRouterBridge,
    private readonly router: Router,
  ) {
    super(bridge, new ApplicationConfig(), new TestModuleExportResolver());
  }

  get requests(): RequestExecutorInterface {
    return this.getApplicationScope().get(RequestExecutorInterface);
  }

  get session(): SessionRuntimeStateInterface {
    return this.getApplicationScope().get(SessionRuntimeStateInterface);
  }

  isActive(token: abstract new (...args: never[]) => unknown): boolean {
    return matchesNavigationRoute(this.getNavigationSnapshot().navigation, token);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(this.router);
  }
}

describe('NativeRouterBridge authentication transport', () => {
  it('resets physical history on 401 and restores the saved protected location as a fresh branch', async () => {
    const signInLoad = vi.fn(async () => ({}));
    const protectedLoad = vi.fn(async () => ({}));
    const transport = new TestTransport(location(['protected']));
    const bridge = createNativeRouterBridge({ transport });
    const app = new TestApplication(bridge, createRouter(signInLoad, protectedLoad));

    app.compose();
    await app.initialize();

    expect(app.isActive(SignInRoute)).toBe(true);
    expect(bridge.getSnapshot().entries).toHaveLength(1);
    const anonymousEntry = bridge.getSnapshot().entries[0]!.id;

    app.session.setAuthenticated();

    await vi.waitFor(() => expect(app.isActive(ProtectedRoute)).toBe(true));
    expect(bridge.getSnapshot().entries).toHaveLength(1);
    expect(bridge.getSnapshot().entries[0]!.id).not.toBe(anonymousEntry);
    const authenticatedEntry = bridge.getSnapshot().entries[0]!.id;

    void app.requests.run(() => Promise.reject(new UnauthorizedException({ title: 'Unauthorized' })));

    await vi.waitFor(() => expect(app.isActive(SignInRoute)).toBe(true));
    expect(bridge.getSnapshot().entries).toHaveLength(1);
    expect(bridge.getSnapshot().entries[0]!.id).not.toBe(authenticatedEntry);

    app.session.setAuthenticated();

    await vi.waitFor(() => expect(app.isActive(ProtectedRoute)).toBe(true));
    expect(bridge.getSnapshot().entries).toHaveLength(1);
    expect(signInLoad).toHaveBeenCalledTimes(2);
    expect(protectedLoad).toHaveBeenCalledTimes(2);

    await app.dispose();
  });
});

class TestTransport implements NativeRouterTransportInterface {
  constructor(private readonly initial: RouterBridgeLocationInterface) {}

  async getInitialLocation(): Promise<RouterBridgeLocationInterface> {
    return this.initial;
  }

  subscribe(_listener: NativeRouterTransportListener): () => void {
    return () => undefined;
  }
}

const createRouter = (
  signInLoad: () => Promise<Readonly<Record<string, unknown>>>,
  protectedLoad: () => Promise<Readonly<Record<string, unknown>>>,
): Router =>
  new Router({
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

const location = (address: readonly string[]): RouterBridgeLocationInterface =>
  Object.freeze({ address, nested: null, query: Object.freeze({}), state: undefined });
