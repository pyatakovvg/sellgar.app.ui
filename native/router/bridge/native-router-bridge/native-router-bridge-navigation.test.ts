import { afterEach, describe, expect, it, vi } from 'vitest';

const linking = vi.hoisted(() => ({
  initial: vi.fn<() => Promise<string | null>>(),
  listener: null as ((event: { url: string }) => void) | null,
}));

vi.mock('react-native', () => ({
  Linking: {
    getInitialURL: linking.initial,
    addEventListener: (_event: string, listener: (event: { url: string }) => void) => {
      linking.listener = listener;
      return {
        remove: () => {
          linking.listener = null;
        },
      };
    },
  },
}));

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
import { Policy } from '../../../../core/policy/contract/policy';
import type { PolicyResult } from '../../../../core/policy/contract/policy-result';
import type { RouterBridgeCommitContextInterface } from '../../../../core/router/bridge/router-bridge';
import { param, segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import { matchesNavigationRoute, type NavigationState } from '../../../../core/router/runtime/navigation-state';
import { RoutePolicyInterface } from '../../../../core/router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../../core/router/runtime/route-runtime-context';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { createNativeLinkingTransport } from '../../transport/native-linking-transport';
import type { NativeRouterTransportTarget } from '../../transport/native-router-transport';
import { NativeRouterBridge } from './native-router-bridge';

class DashboardRoute {}
class SignInRoute {}
class OnboardingRoute {}
class SettingsRoute {}
class SlowRoute {}
class OrderRoute {
  declare readonly orderId: string;
}
class ItemRoute {
  declare readonly itemId: string;
}
class TestModule {}

@Policy()
class Authenticated extends RoutePolicyInterface {
  execute(context: RouteRuntimeContextInterface): PolicyResult {
    return { type: context.session.phase === 'authenticated' ? 'pass' : 'fail' };
  }
}

@Policy()
class Anonymous extends RoutePolicyInterface {
  execute(context: RouteRuntimeContextInterface): PolicyResult {
    return { type: context.session.phase === 'authenticated' ? 'fail' : 'pass' };
  }
}

@Policy()
class NoDeviceSession extends RoutePolicyInterface {
  execute(): PolicyResult {
    return { type: 'fail' };
  }
}

@UseBindings(NavigationBlockerBindings)
@Feature()
class BlockerFeature implements ApplicationFeatureInterface {}

class RecordingBridge extends NativeRouterBridge {
  readonly commits: RouterBridgeCommitContextInterface[] = [];

  override async commit(navigation: NavigationState, context: RouterBridgeCommitContextInterface): Promise<void> {
    this.commits.push(context);
    await super.commit(navigation, context);
  }
}

class TestApplication extends Application<null> {
  constructor(
    bridge: NativeRouterBridge,
    private readonly router: Router,
  ) {
    super(bridge, new ApplicationConfig(), {
      resolve: () => createModuleRuntimeDefinition({ presentation: null, token: TestModule }),
    });
  }

  get navigation() {
    return this.getNavigationSnapshot();
  }
  get sessionState() {
    return this.getApplicationScope().get(SessionRuntimeStateInterface);
  }
  get navigate() {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }
  get blockerRuntime() {
    return this.getApplicationScope().get(NavigationBlockerRuntimeInterface);
  }
  get blocker() {
    return this.getRouterRuntime()
      .getActiveRouteRuntimes()
      .at(-1)!
      .getRouteScope()
      .get(NavigationBlockerServiceInterface);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([BlockerFeature]);
    app.router(this.router);
  }
}

const resolveLink = (url: string): NativeRouterTransportTarget | null => {
  switch (url) {
    case 'wallet://top-up':
      return (navigate) => navigate.to(DashboardRoute, { state: { open: 'top-up-bank-card' } });
    case 'wallet://replace':
      return (navigate) => navigate.to(DashboardRoute, { replace: true });
    case 'wallet://reset':
      return (navigate) => navigate.resetTo(DashboardRoute);
    case 'wallet://order':
      return (navigate) =>
        navigate.through(OrderRoute, { params: { orderId: 'order-1' } }).to(ItemRoute, {
          params: { itemId: 'item-2' },
          query: { tab: 'details' },
          state: { from: 'link' },
        });
    case 'wallet://slow':
      return (navigate) => navigate.to(SlowRoute);
    default:
      return null;
  }
};

const createRouter = (loadSlow: () => Promise<Record<string, unknown>> = async () => ({})) =>
  new Router({
    routes: [
      new Route({
        canMatch: [
          Anonymous.configure().onFail(Router.redirectToSaved({ replace: true })),
          NoDeviceSession.configure().onFail(Router.redirectTo(SignInRoute, { replace: true })),
        ],
        routes: [new Route({ token: OnboardingRoute, load: async () => ({}) })],
      }),
      new Route({
        canMatch: [Anonymous.configure().onFail(Router.redirectToSaved({ replace: true }))],
        defaultTo: SignInRoute,
        routes: [new Route({ token: SignInRoute, address: segments('auth', 'code'), load: async () => ({}) })],
      }),
      new Route({
        canMatch: [
          Authenticated.configure().onFail(
            Router.redirectTo(OnboardingRoute, { replace: true, saveCurrentLocation: true }),
          ),
        ],
        routes: [
          new Route({ token: DashboardRoute, load: async () => ({}) }),
          new Route({ token: SettingsRoute, address: segments('settings'), load: async () => ({}) }),
          new Route({ token: SlowRoute, address: segments('slow'), load: loadSlow }),
          new Route({
            token: OrderRoute,
            address: segments('orders', param('orderId')),
            load: async () => ({}),
            routing: [
              new Router({
                routes: [
                  new Route({ token: ItemRoute, address: segments('items', param('itemId')), load: async () => ({}) }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

const applications: TestApplication[] = [];
afterEach(async () => {
  for (const app of applications.splice(0)) await app.dispose();
  linking.initial.mockReset();
  linking.listener = null;
});

const start = async (url: string | null, authenticated = true, router = createRouter()) => {
  linking.initial.mockResolvedValue(url);
  const bridge = new RecordingBridge({ transport: createNativeLinkingTransport({ resolve: resolveLink }) });
  const app = new TestApplication(bridge, router);
  applications.push(app);
  app.compose();
  if (authenticated) app.sessionState.setAuthenticated();
  else app.sessionState.setAnonymous();
  await app.initialize();
  return { app, bridge };
};

const expectActive = async (app: TestApplication, token: typeof DashboardRoute) => {
  await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.navigation, token)).toBe(true));
};

describe('Native URL navigation requests through the core lifecycle', () => {
  it('keeps a newer URL event when getInitialURL resolves with an older URL', async () => {
    let completeInitial!: (url: string) => void;
    linking.initial.mockReturnValueOnce(
      new Promise((resolve) => {
        completeInitial = resolve;
      }),
    );
    const starting = start(null);
    await vi.waitFor(() => expect(linking.listener).not.toBeNull());
    const app = applications.at(-1)!;
    try {
      linking.listener!({ url: 'wallet://top-up' });
      await expectActive(app, DashboardRoute);
    } finally {
      completeInitial('wallet://replace');
    }
    const { bridge } = await starting;
    expect(app.navigation.navigation?.state).toEqual({ open: 'top-up-bank-card' });
    expect(bridge.commits).toHaveLength(1);
  });

  it.each(['initial', 'event'] as const)('preserves a Dashboard action through PIN (%s URL)', async (source) => {
    const { app, bridge } = await start(source === 'initial' ? 'wallet://top-up' : null, false);
    await expectActive(app, SignInRoute);
    if (source === 'event') {
      linking.listener!({ url: 'wallet://top-up' });
      await vi.waitFor(() => expect(bridge.commits.at(-1)?.source).toBe('external'));
    }
    app.sessionState.setAuthenticated();
    await expectActive(app, DashboardRoute);
    expect(app.navigation.navigation?.state).toEqual({ open: 'top-up-bank-card' });
    expect(bridge.getSnapshot().entries).toHaveLength(1);
    expect(bridge.getSnapshot().entries[0]!.location.state).toEqual({ open: 'top-up-bank-card' });
  });

  it('pushes an addressless Dashboard over Settings and returns to Settings on Back', async () => {
    const { app, bridge } = await start(null);
    await app.navigate.to(SettingsRoute);
    const settingsId = bridge.getSnapshot().entries.at(-1)!.id;
    linking.listener!({ url: 'wallet://top-up' });
    await expectActive(app, DashboardRoute);
    expect(bridge.commits.at(-1)).toMatchObject({ source: 'external', history: { action: 'push' } });
    expect(bridge.getSnapshot().entries.at(-2)!.id).toBe(settingsId);
    await bridge.back();
    await expectActive(app, SettingsRoute);
  });

  it.each(['replace', 'reset'] as const)('uses the explicit %s history operation', async (action) => {
    const { app, bridge } = await start(null);
    await app.navigate.to(SettingsRoute);
    linking.listener!({ url: `wallet://${action}` });
    await expectActive(app, DashboardRoute);
    expect(bridge.commits.at(-1)).toMatchObject({ source: 'external', history: { action } });
    expect(bridge.getSnapshot().entries).toHaveLength(action === 'reset' ? 1 : 2);
  });

  it('resolves a nested token request with through params, query and state', async () => {
    const { app, bridge } = await start('wallet://order');
    const navigation = app.navigation.navigation!;
    expect(matchesNavigationRoute(navigation, OrderRoute, { params: { orderId: 'order-1' }, end: false })).toBe(true);
    expect(matchesNavigationRoute(navigation, ItemRoute, { params: { itemId: 'item-2' } })).toBe(true);
    expect(navigation.root.child?.query).toEqual({ tab: 'details' });
    expect(navigation.state).toEqual({ from: 'link' });
    expect(bridge.commits.at(-1)?.source).toBe('external');
  });

  it('keeps history and the committed screen when a URL is rejected by a navigation blocker', async () => {
    const { app, bridge } = await start(null);
    await app.navigate.to(SettingsRoute);
    app.blocker.register(() => true);
    const before = bridge.getSnapshot();
    linking.listener!({ url: 'wallet://top-up' });
    await vi.waitFor(() => expect(app.blockerRuntime.getSnapshot()).not.toBeNull());
    app.blockerRuntime.stay();
    await vi.waitFor(() => expect(app.navigation.pending).toBeNull());
    expect(matchesNavigationRoute(app.navigation.navigation, SettingsRoute)).toBe(true);
    expect(bridge.getSnapshot()).toBe(before);
  });

  it('cancels a pending URL transition through Back without changing history', async () => {
    let finishLoad!: (module: Record<string, unknown>) => void;
    const load = new Promise<Record<string, unknown>>((resolve) => {
      finishLoad = resolve;
    });
    const { app, bridge } = await start(
      null,
      true,
      createRouter(() => load),
    );
    await app.navigate.to(SettingsRoute);
    const before = bridge.getSnapshot();
    linking.listener!({ url: 'wallet://slow' });
    await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.pending, SlowRoute)).toBe(true));
    await bridge.back();
    finishLoad({});
    await vi.waitFor(() => expect(app.navigation.pending).toBeNull());
    expect(matchesNavigationRoute(app.navigation.navigation, SettingsRoute)).toBe(true);
    expect(bridge.getSnapshot().entries).toEqual(before.entries);
  });

  it('supersedes a pending URL with the next URL through the normal core cancellation', async () => {
    let finishLoad!: (module: Record<string, unknown>) => void;
    const load = new Promise<Record<string, unknown>>((resolve) => {
      finishLoad = resolve;
    });
    const { app, bridge } = await start(
      null,
      true,
      createRouter(() => load),
    );
    await app.navigate.to(SettingsRoute);
    const historyLength = bridge.getSnapshot().entries.length;
    try {
      linking.listener!({ url: 'wallet://slow' });
      await vi.waitFor(() => expect(matchesNavigationRoute(app.navigation.pending, SlowRoute)).toBe(true));
      linking.listener!({ url: 'wallet://top-up' });
      // A lazy import cannot be aborted; the superseded load may finish without committing its route.
      finishLoad({});
      await expectActive(app, DashboardRoute);
      expect(app.navigation.navigation?.state).toEqual({ open: 'top-up-bank-card' });
      expect(bridge.getSnapshot().entries).toHaveLength(historyLength + 1);
      expect(bridge.getSnapshot().entries.some((entry) => entry.location.address.includes('slow'))).toBe(false);
    } finally {
      finishLoad({});
    }
  });
});
