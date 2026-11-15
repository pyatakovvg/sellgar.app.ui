import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Application as CoreApplication } from '../../../../core/application/lifecycle/application';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { segments, param } from '../../../../core/router/declaration/address';
import { ApplicationConfig } from '../../../application/config/application-config';
import type { ApplicationConfiguratorInterface } from '../../../application/config/application-configurator';
import { Module, type ModuleMetadata } from '../../../module/declaration/module';
import { NativeModuleExportResolver } from '../../../module/resolution/module-export-resolver';
import { ScreenRenderer } from '../../../screen/rendering/screen-renderer';
import { ScreenAnimation } from '../../../screen/declaration/screen-animation';
import {
  resolveNativeRouterBridge,
  createNativeRouterBridge,
  type NativeRouterBridge,
} from '../../bridge/native-router-bridge';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { NativePresentationRuntime } from './native-presentation-runtime';
import { SessionRuntimeStateInterface } from '../../../../core/application/session/session-runtime-state';
import { Controller } from '../../../../core/controller/contract/controller';
import { Inject } from '../../../../core/di/injection/decorators';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { Policy } from '../../../../core/policy/contract/policy';
import { RoutePolicyInterface } from '../../../../core/router/runtime/route-policy';
import type { RouteRuntimeContextInterface } from '../../../../core/router/runtime/route-runtime-context';
import type { PolicyResult } from '../../../../core/policy/contract/policy-result';
import { matchesNavigationRoute } from '../../../../core/router/runtime/navigation-state';
import { RequestExecutorInterface } from '../../../../core/application/request/request-executor';
import { WidgetRuntimeRegistry } from '../../../../core/widget/runtime/widget-runtime-registry';
import { ApplicationComponentsProvider } from '../../../application/rendering/application-components-context';
import { Widget, WidgetDefinition } from '../../../widget/declaration/widget';
import { WidgetHost } from '../../../widget/rendering/widget-host';
import { NativeBackRuntime } from '../native-back-runtime';
import { BackHandler } from 'react-native';

const animations = vi.hoisted(() => ({ complete: [] as ((finished: boolean) => void)[] }));

vi.mock('../../transport/native-linking-transport', () => ({ createNativeLinkingTransport: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })), exitApp: vi.fn() },
  ToastAndroid: { show: vi.fn(), SHORT: 0 },
  View: ({ children, pointerEvents }: React.PropsWithChildren<{ pointerEvents?: string }>) => (
    <div data-pointer={pointerEvents}>{children}</div>
  ),
  StyleSheet: { create: (styles: object) => styles },
  TextInput: { State: { currentlyFocusedInput: () => null } },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock('react-native-reanimated', async () => {
  const { View } = await import('react-native');
  return {
    default: { View },
    cancelAnimation: () => undefined,
    runOnJS: (callback: unknown) => callback,
    useAnimatedStyle: (updater: () => object) => updater(),
    useSharedValue: (value: number) => React.useRef({ value }).current,
    withTiming: (_value: number, _config: object, complete: (finished: boolean) => void) => {
      animations.complete.push(complete);
      return 0;
    },
  };
});
vi.mock('react-native-worklets', () => ({ runOnUISync: (callback: () => void) => callback() }));

@Module({ view: () => <span>page</span> })
class PageModule {}
class Products {}
class Details {
  declare readonly id: string;
}
class Brands {}
class Brand {
  declare readonly id: string;
}
class SignIn {}
class Onboarding {}

@Controller()
class SignInController {
  constructor(@Inject(SessionRuntimeStateInterface) private readonly sessionState: SessionRuntimeStateInterface) {}
  async action() {
    await Promise.resolve();
    this.sessionState.setAuthenticated();
  }
}
class AuthBindings {
  register(registry: BindingRegistryInterface) {
    registry.bind(SignInController).toSelf().inSingletonScope();
  }
}
@UseBindings(AuthBindings)
@Module({ view: () => <span>sign in</span> })
class SignInModule {}

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

class TestApplication extends CoreApplication<ModuleMetadata, ApplicationConfiguratorInterface> {
  constructor(
    readonly bridge: NativeRouterBridge,
    private readonly router: Router,
  ) {
    super(bridge, new ApplicationConfig(), new NativeModuleExportResolver());
  }

  get navigate() {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }
  get sessionState() {
    return this.getApplicationScope().get(SessionRuntimeStateInterface);
  }
  get navigation() {
    return this.getNavigationSnapshot();
  }
  get routes() {
    return this.getRouterRuntime().getActiveRouteRuntimes();
  }
  authenticate() {
    return this.getRouterRuntime().getActiveRouteRuntimes().at(-1)!.action(SignInController, undefined);
  }

  createPresentation() {
    return new NativePresentationRuntime({
      components: { fallback: <span>loading</span> },
      getHistoryEntries: () => this.getRouterHistoryEntries(),
      getNavigation: () => this.getNavigationSnapshot(),
      getRouterRuntime: () => this.getRouterRuntime(),
      getRuntimeEntries: () => this.getRouterRuntimeEntries(),
      routerBridge: this.bridge,
      subscribeNavigation: (listener) => this.subscribeNavigation(listener),
    });
  }

  protected configure(app: ApplicationConfiguratorInterface) {
    app.router(this.router);
  }
}

const flush = async () => {
  await act(async () => {
    for (let index = 0; index < 100; index++) await Promise.resolve();
  });
};

const completeNavigation = async (request: () => Promise<unknown>) => {
  let settled = false;
  let operation!: Promise<unknown>;
  act(() => {
    operation = request().finally(() => {
      settled = true;
    });
  });
  await flush();
  for (let step = 0; step < 10 && !settled; step++) {
    act(() => animations.complete.splice(0).forEach((callback) => callback(true)));
    await flush();
  }
  expect(settled, 'native navigation must settle without waiting for the old HTTP response').toBe(true);
  await operation;
};

class RequestDestination {}

const createRequestFixture = async (
  nested: boolean,
  widget: boolean,
  holdInitialWidget = false,
  loadChildData = false,
) => {
  animations.complete.length = 0;
  const read = vi.fn<() => Promise<number>>().mockResolvedValue(1);
  const signals: AbortSignal[] = [];
  const hold = () => {
    let resolve!: (value: number) => void;
    const promise = new Promise<number>((accept) => {
      resolve = accept;
    });
    read.mockReturnValueOnce(promise);
    return resolve;
  };

  @Controller()
  class DataController {
    constructor(@Inject(RequestExecutorInterface) private readonly requests: RequestExecutorInterface) {}
    loader() {
      return this.requests.run({ mode: 'sequential', queueKey: 'native-data' }, ({ signal }) => {
        signals.push(signal);
        return read();
      });
    }
  }
  class DataBindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(DataController).toSelf().inSingletonScope();
    }
  }
  @UseBindings(DataBindings)
  @Widget({ view: () => <span>widget</span> })
  class DataWidget extends WidgetDefinition {}
  @UseBindings(DataBindings)
  @Module({ view: () => (widget ? <WidgetHost token={DataWidget} /> : <span>data</span>) })
  class DataModule {}
  const child = new Route({
    address: segments('detail'),
    token: RequestDestination,
    animation: ScreenAnimation.SlideFromRight,
    load: async () => (loadChildData ? { DataModule } : { PageModule }),
  });
  const parent = new Route({
    address: segments('products'),
    token: Products,
    load: async () => ({ DataModule }),
    routes: nested ? [child] : undefined,
  });
  const router = new Router({ routes: nested ? [parent] : [parent, child] });
  const bridge = resolveNativeRouterBridge(
    createNativeRouterBridge({
      transport: {
        getInitialLocation: async () => ({ address: ['products'], nested: null, query: {}, state: undefined }),
        subscribe: () => () => undefined,
      },
    }),
  );
  const app = new TestApplication(bridge, router);
  app.compose();
  const presentation = app.createPresentation();
  await app.initialize();
  const route = app.routes[0]!;
  const scope = route.getModuleRuntime().getActiveModule().scope;
  const registry = scope.get(WidgetRuntimeRegistry);
  const finishInitial = holdInitialWidget ? hold() : null;
  const back = new NativeBackRuntime(bridge, {
    getLifecycle: () => app.lifecycle,
    subscribeLifecycle: (listener) => app.subscribe(listener),
  });
  const view = render(
    <ApplicationComponentsProvider components={{}}>
      <ScreenRenderer
        runtime={presentation.routes.root}
        onPresentationComplete={presentation.routes.completePresentation}
      />
    </ApplicationComponentsProvider>,
  );
  await flush();
  return {
    app,
    bridge,
    back,
    route,
    DataController,
    read,
    signals,
    hold,
    finishInitial,
    getWidget: () => registry.get({ ownerScope: scope, token: DataWidget })!,
    dispose: async () => {
      view.unmount();
      back.dispose();
      presentation.dispose();
      await app.dispose();
    },
  };
};

describe('native request cancellation through real retained screens', () => {
  it('keeps a busy loader while repeated query changes supersede one another', async () => {
    const f = await createRequestFixture(false, false);
    const finish = f.hold();
    let refresh!: Promise<void>;
    act(() => {
      refresh = f.route.revalidate();
    });
    await flush();
    const signal = f.signals.at(-1)!;
    const calls = f.read.mock.calls.length;
    const queries: Promise<void>[] = [];
    try {
      act(() => {
        queries.push(f.app.navigate.query({ sort: 'first' }));
      });
      await flush();
      act(() => {
        queries.push(f.app.navigate.query({ sort: 'second' }));
      });
      await flush();
      expect(signal.aborted).toBe(false);
      expect(f.read).toHaveBeenCalledTimes(calls);
      await act(async () => finish(2));
      await Promise.all([refresh, ...queries]);
      f.read.mockResolvedValueOnce(3);
      await act(async () => f.route.revalidate());
      expect(f.route.getLoaderData(f.DataController)).toBe(3);
    } finally {
      finish(2);
      await Promise.allSettled([refresh, ...queries]);
      await f.dispose();
    }
  });

  it.each(['back', 'supersede'] as const)(
    'cancels the destination HTTP request on %s during its initial loader',
    async (intent) => {
      const f = await createRequestFixture(false, false, false, true);
      const finish = f.hold();
      let forward!: Promise<void>;
      act(() => {
        forward = f.app.navigate.to(RequestDestination);
      });
      await flush();
      const signal = f.signals.at(-1)!;
      try {
        expect(f.app.navigation.pending).not.toBeNull();
        expect(signal.aborted).toBe(false);
        await completeNavigation(() => (intent === 'back' ? f.back.request() : f.app.navigate.to(Products)));
        await forward;
        expect(signal.aborted).toBe(true);
        await act(async () => f.route.revalidate());
        expect(f.route.getLoaderData(f.DataController)).toBe(1);
        await act(async () => finish(99));
        expect(f.route.getLoaderData(f.DataController)).toBe(1);
      } finally {
        finish(99);
        await forward;
        await f.dispose();
      }
    },
  );

  it('coalesces repeated Android hardware Back while the screen transition is pending', async () => {
    const f = await createRequestFixture(false, false, false, true);
    try {
      await completeNavigation(() => f.app.navigate.to(RequestDestination));
      const finish = f.hold();
      const route = f.app.routes.at(-1)!;
      let refresh!: Promise<void>;
      act(() => {
        refresh = route.revalidate();
      });
      await flush();
      const signal = f.signals.at(-1)!;
      try {
        const handler = vi.mocked(BackHandler.addEventListener).mock.calls.at(-1)![1];
        await completeNavigation(() => {
          for (let index = 0; index < 20; index++) {
            expect(handler({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true);
          }
          return f.back.request();
        });
        await refresh;
        expect(signal.aborted).toBe(true);
        expect(f.bridge.getSnapshot().entries).toHaveLength(1);
        expect(BackHandler.exitApp).not.toHaveBeenCalled();
        await act(async () => f.route.revalidate());
        expect(f.route.getLoaderData(f.DataController)).toBe(1);
      } finally {
        finish(99);
        await refresh;
      }
    } finally {
      await f.dispose();
    }
  });

  it.each(['push', 'replace', 'reset', 'back', 'deep-link'] as const)(
    'cancels a module refresh on %s and admits a later refresh',
    async (direction) => {
      const f = await createRequestFixture(false, false);
      if (direction === 'back') {
        await completeNavigation(() => f.app.navigate.to(RequestDestination));
        await completeNavigation(() => f.app.navigate.to(Products));
      }
      const finish = f.hold();
      const calls = f.read.mock.calls.length;
      let refresh!: Promise<void>;
      act(() => {
        refresh = f.route.revalidate();
      });
      await flush();
      const signal = f.signals.at(-1)!;
      try {
        const repeats = Array.from({ length: 20 }, () => f.route.revalidate());
        await flush();
        expect(f.read).toHaveBeenCalledTimes(calls + 1);
        await completeNavigation(() => {
          switch (direction) {
            case 'back':
              return f.bridge.back();
            case 'replace':
              return f.app.navigate.to(RequestDestination, { replace: true });
            case 'reset':
              return f.app.navigate.resetTo(RequestDestination);
            case 'deep-link':
              return f.bridge.restore({ address: ['detail'], nested: null, query: {}, state: undefined });
            default:
              return f.app.navigate.to(RequestDestination);
          }
        });
        await Promise.all([refresh, ...repeats]);
        expect(signal.aborted).toBe(true);
        expect(f.route.getRevalidateState().inProcess).toBe(false);
        await completeNavigation(() => f.app.navigate.to(Products));
        const current = f.app.routes[0]!;
        await act(async () => current.revalidate());
        expect(current.getLoaderData(f.DataController)).toBe(1);
        await act(async () => finish(99));
        expect(current.getLoaderData(f.DataController)).toBe(1);
      } finally {
        finish(99);
        await refresh;
        await f.dispose();
      }
    },
  );

  describe.each([false, true])('widget on a retained screen (child route: %s)', (nested) => {
    it.each(['initial', 'revalidation'] as const)(
      'cancels %s, preserves its runtime and recovers after Back',
      async (mode) => {
        const f = await createRequestFixture(nested, true, mode === 'initial');
        const widget = f.getWidget();
        const finish = f.finishInitial ?? f.hold();
        let refresh: Promise<void> = Promise.resolve();
        if (mode === 'revalidation') {
          act(() => {
            refresh = widget.revalidate();
          });
          await flush();
        }
        const signal = f.signals.at(-1)!;
        const callsBeforeExit = f.read.mock.calls.length;
        try {
          await completeNavigation(() => f.app.navigate.to(RequestDestination));
          await refresh;
          expect(signal.aborted).toBe(true);
          expect(widget.getRevalidateState().inProcess).toBe(false);
          expect(f.read).toHaveBeenCalledTimes(callsBeforeExit);
          const callsWhileHidden = f.read.mock.calls.length;
          await flush();
          expect(f.read).toHaveBeenCalledTimes(callsWhileHidden);
          await completeNavigation(() => f.bridge.back());
          expect(f.getWidget()).toBe(widget);
          expect(widget.getSnapshot().phase).toBe('ready');
          await act(async () => widget.revalidate());
          expect(widget.getLoaderData(f.DataController)).toBe(1);
          await act(async () => finish(99));
          expect(widget.getLoaderData(f.DataController)).toBe(1);
        } finally {
          finish(99);
          await refresh;
          await f.dispose();
        }
      },
    );
  });
});

describe('native navigation completion across real core and screen runtimes', () => {
  it.each([false, true])(
    'finishes sign-in and its policy redirect (anonymous index first: %s)',
    async (anonymousIndexFirst) => {
      animations.complete.length = 0;
      const protectedBranch = new Route({
        canMatch: [
          Authenticated.configure().onFail(Router.redirectTo(SignIn, { replace: true, saveCurrentLocation: true })),
        ],
        defaultTo: anonymousIndexFirst ? undefined : Router.firstAvailable(),
        routes: [
          new Route({
            address: anonymousIndexFirst ? undefined : segments('products'),
            token: Products,
            animation: ScreenAnimation.Fade,
            load: async () => ({ PageModule }),
          }),
        ],
      });
      const anonymousBranch = new Route({
        canMatch: [Anonymous.configure().onFail(Router.redirectToSaved({ replace: true }))],
        defaultTo: SignIn,
        routes: [new Route({ address: segments('auth', 'code'), token: SignIn, load: async () => ({ SignInModule }) })],
      });
      const onboardingBranch = new Route({
        canMatch: [Anonymous.configure().onFail(Router.redirectToSaved({ replace: true }))],
        routes: [new Route({ token: Onboarding, load: async () => ({ PageModule }) })],
      });
      const router = new Router({
        routes: anonymousIndexFirst
          ? [onboardingBranch, anonymousBranch, protectedBranch]
          : [protectedBranch, anonymousBranch],
      });
      const bridge = resolveNativeRouterBridge(
        createNativeRouterBridge({
          transport: {
            getInitialLocation: async () => ({
              address: anonymousIndexFirst ? ['auth', 'code'] : ['products'],
              nested: null,
              query: {},
              state: undefined,
            }),
            subscribe: () => () => undefined,
          },
        }),
      );
      const app = new TestApplication(bridge, router);
      app.compose();
      app.sessionState.setAnonymous();
      const presentation = app.createPresentation();
      await app.initialize();
      const unregister = bridge.registerDriver({ rootBack: () => undefined });
      const view = render(
        <ScreenRenderer
          runtime={presentation.routes.root}
          onPresentationComplete={presentation.routes.completePresentation}
        />,
      );
      let settled = false;
      let failure: unknown;
      try {
        expect(matchesNavigationRoute(app.navigation.navigation, SignIn)).toBe(true);
        let operation!: Promise<unknown>;
        act(() => {
          operation = app.authenticate().then(
            () => {
              settled = true;
            },
            (error) => {
              failure = error;
            },
          );
        });
        await flush();
        for (let step = 0; step < 10 && !settled; step++) {
          act(() => animations.complete.splice(0).forEach((callback) => callback(true)));
          await flush();
        }
        expect(app.sessionState.phase).toBe('authenticated');
        expect(failure).toBeUndefined();
        expect(settled, `sign-in pending at presentation revision ${bridge.getPendingPresentationRevision()}`).toBe(
          true,
        );
        await operation;
        expect(matchesNavigationRoute(app.navigation.navigation, Products)).toBe(true);
        expect(bridge.getPendingPresentationRevision()).toBeNull();
        expect(view.container.textContent).toBe('page');
      } finally {
        view.unmount();
        unregister();
        presentation.dispose();
        await app.dispose();
      }
    },
  );

  it('settles detail, tab and back navigation after screen animations finish', async () => {
    animations.complete.length = 0;
    const load = async () => ({ PageModule });
    const router = new Router({
      routes: [
        new Route({
          defaultTo: Router.firstAvailable(),
          routes: [
            new Route({
              address: segments('products'),
              token: Products,
              load,
              routes: [
                new Route({
                  address: segments(param('id')),
                  token: Details,
                  load,
                  animation: ScreenAnimation.SlideFromRight,
                }),
              ],
            }),
            new Route({
              address: segments('brands'),
              token: Brands,
              load,
              routes: [
                new Route({
                  address: segments(param('id')),
                  token: Brand,
                  load,
                  animation: ScreenAnimation.SlideFromRight,
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const bridge = resolveNativeRouterBridge(
      createNativeRouterBridge({
        transport: {
          getInitialLocation: async () => null,
          subscribe: () => () => undefined,
        },
      }),
    );
    const app = new TestApplication(bridge, router);
    app.compose();
    const presentation = app.createPresentation();
    await app.initialize();
    const unregister = bridge.registerDriver({ rootBack: () => undefined });
    const view = render(
      <ScreenRenderer
        runtime={presentation.routes.root}
        onPresentationComplete={presentation.routes.completePresentation}
      />,
    );

    const complete = async (request: () => Promise<void>) => {
      let settled = false;
      let operation!: Promise<void>;
      act(() => {
        operation = request().then(() => {
          settled = true;
        });
      });
      await flush();
      for (let step = 0; step < 10 && !settled; step++) {
        const callbacks = animations.complete.splice(0);
        act(() => callbacks.forEach((callback) => callback(true)));
        await flush();
      }
      expect(settled, `navigation pending at presentation revision ${bridge.getPendingPresentationRevision()}`).toBe(
        true,
      );
      await operation;
      expect(bridge.getPendingPresentationRevision()).toBeNull();
    };

    try {
      await complete(() => app.navigate.to(Details, { params: { id: 'one' } }));
      await complete(() => app.navigate.to(Details, { params: { id: 'replacement' }, replace: true }));
      expect(bridge.getSnapshot().entries.map(({ location }) => location.address)).toEqual([
        ['products'],
        ['products', 'replacement'],
      ]);
      await complete(() => bridge.back());
      expect(bridge.getSnapshot().entries.map(({ location }) => location.address)).toEqual([['products']]);
      await complete(() => app.navigate.to(Brands));
      await complete(() => app.navigate.to(Brand, { params: { id: 'two' } }));
      await complete(() => app.navigate.to(Products));
      await complete(() => app.navigate.to(Details, { params: { id: 'three' } }));
      await complete(() => bridge.back());
      await complete(() => app.navigate.resetTo(Details, { params: { id: 'reset' } }));
      expect(bridge.getSnapshot().action).toBe('reset');
      expect(bridge.getSnapshot().entries.map(({ location }) => location.address)).toEqual([['products', 'reset']]);
      await complete(() => bridge.back());
      expect(bridge.getSnapshot().entries.map(({ location }) => location.address)).toEqual([['products', 'reset']]);
    } finally {
      view.unmount();
      unregister();
      presentation.dispose();
      await app.dispose();
    }
  });
});
