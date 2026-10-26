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
import { createNativeRouterBridge, type NativeRouterBridge } from '../../bridge/native-router-bridge';
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

const animations = vi.hoisted(() => ({ complete: [] as ((finished: boolean) => void)[] }));

vi.mock('../../transport/native-linking-transport', () => ({ createNativeLinkingTransport: vi.fn() }));
vi.mock('react-native', () => ({
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
      const bridge = createNativeRouterBridge({
        transport: {
          getInitialLocation: async () => ({
            address: anonymousIndexFirst ? ['auth', 'code'] : ['products'],
            nested: null,
            query: {},
            state: undefined,
          }),
          subscribe: () => () => undefined,
        },
      });
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
    const bridge = createNativeRouterBridge({
      transport: {
        getInitialLocation: async () => null,
        subscribe: () => () => undefined,
      },
    });
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
