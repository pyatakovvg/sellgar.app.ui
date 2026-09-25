import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: (props: React.PropsWithChildren) => <div>{props.children}</div>,
  StyleSheet: { create: (styles: object) => styles },
}));
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: (props: React.PropsWithChildren) => props.children,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: (props: React.PropsWithChildren) => props.children,
}));
vi.mock('../../../../native/router/rendering/native-navigation-host', () => ({
  NativeNavigationHost: () => null,
}));
vi.mock('../../../../native/router/rendering/nested-router-layer', () => ({
  NestedRouterLayer: () => null,
}));
vi.mock('../../../../native/keyboard/rendering/keyboard-surface', () => ({
  KeyboardSurface: (props: React.PropsWithChildren) => props.children,
}));
vi.mock('../../../../native/keyboard/runtime/keyboard-runtime-context', () => ({
  KeyboardRuntimeProvider: (props: React.PropsWithChildren) => props.children,
}));
vi.mock('../../../../native/screen/rendering/screen-compositor', () => ({
  ScreenCompositor: (props: React.PropsWithChildren) => props.children,
  ScreenLayerHost: (props: React.PropsWithChildren) => props.children,
}));

import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import type {
  ApplicationFeatureInterface,
  ApplicationFeatureToken,
} from '../../../../core/application/feature/application-feature';
import { ApplicationFeaturesRuntime } from '../../../../core/application/feature/application-features-runtime';
import { Controller } from '../../../../core/controller/contract/controller';
import { SessionRuntimeState } from '../../../../core/application/session/session-runtime-state';
import { useLoaderData as useReactData } from '../../../../react/controller/hook/use-loader-data';
import { useLoaderData as useFsmData } from '../../../../fsm/controller/hook/use-loader-data';
import { useLoaderData as useNativeData } from '../../../../native/controller/hook/use-loader-data';
import { useSubmit as useReactSubmit } from '../../../../react/controller/hook/use-submit';
import { useSubmit as useFsmSubmit } from '../../../../fsm/controller/hook/use-submit';
import { useSubmit as useNativeSubmit } from '../../../../native/controller/hook/use-submit';
import { ControllerRuntimeProvider as ReactControllerProvider } from '../../../../react/controller/runtime/controller-runtime-context';
import { ControllerRuntimeProvider as FsmControllerProvider } from '../../../../fsm/controller/runtime/controller-runtime-context';
import { ControllerRuntimeProvider as NativeControllerProvider } from '../../../../native/controller/runtime/controller-runtime-context';
import type { ControllerRuntimeContextValue } from '../../../controller/runtime/controller-runtime';
import type { ApplicationLifecycleSnapshot } from '../../../../core/application/lifecycle/application-lifecycle';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import { createRuntimeFailure } from '../../../../core/runtime/failure/runtime-failure';
import { createRuntimeException } from '../../../../core/runtime/exception/runtime-exception';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { ApplicationHost as ReactHost } from '../../../../react/application/rendering/application-host';
import { ApplicationHost as FsmHost } from '../../../../fsm/application/rendering/application-host';
import {
  createApplicationView as createNativeView,
  type ApplicationViewSource as NativeViewSource,
} from '../../../../native/application/rendering/application-host';
import { Layout as ReactLayout } from '../../../../react/layout/declaration/layout';
import { Layout as FsmLayout } from '../../../../fsm/layout/declaration/layout';
import { Layout as NativeLayout } from '../../../../native/layout/declaration/layout';
import { useDependency as useReactDependency } from '../../../../react/runtime/scope/runtime-scope-context';
import { useDependency as useFsmDependency } from '../../../../fsm/runtime/scope/runtime-scope-context';
import { useDependency as useNativeDependency } from '../../../../native/runtime/scope/runtime-scope-context';
import type { ModuleMetadata } from '../../../../react/module/declaration/module';
import type { NativeRouterBridge } from '../../../../native/router/bridge/native-router-bridge';
import type { NativePresentationRuntime } from '../../../../native/router/runtime/native-presentation-runtime';
import { Feature, type ApplicationFeatureOptions } from '../application-feature';

const Context = React.createContext('outside');
const NativeHost: React.FC<{ source: NativeViewSource }> = ({ source }) => {
  const View = React.useMemo(() => createNativeView(source), [source]);
  return <View />;
};
const Probe: React.FC<{ label: string }> = (props) => (
  <span>
    {props.label}:{React.useContext(Context)}
  </span>
);

class Dependency {}
class Bindings {
  register(registry: BindingRegistryInterface): void {
    registry.bind(Dependency).toConstantValue(new Dependency());
  }
}

const createFeature = (options: ApplicationFeatureOptions = {}): ApplicationFeatureToken => {
  @UseBindings(Bindings)
  @Feature(options)
  class TestFeature implements ApplicationFeatureInterface {}

  return TestFeature;
};

const failure = (cause: unknown) =>
  createRuntimeException(
    createRuntimeFailure(cause, {
      operation: 'render',
      owner: { kind: 'application' },
      participant: { kind: 'runtime' },
    }),
    { disposition: 'application.failed', owner: { kind: 'application' }, phase: 'failed' },
  );

const createSource = (features: readonly ApplicationFeatureToken[]) => {
  const lifecycleListeners = new Set<() => void>();
  const navigationListeners = new Set<() => void>();
  let lifecycle: ApplicationLifecycleSnapshot = { phase: 'initializing', exception: null };
  let navigation = { decision: null, navigation: undefined, pending: null };
  const branch = { child: null, childPending: false, pending: false, pendingLocalChange: null, routes: [] };
  const runtimeState = { exception: null, phase: 'active' as const };
  const routerRuntime = {
    getBranchSnapshot: () => branch,
    getSnapshot: () => runtimeState,
    router: { routes: [] },
    subscribe: () => () => undefined,
  } as unknown as RouterRuntime<ModuleMetadata>;
  const scope = new ApplicationScope();
  scope.bindSession(new SessionRuntimeState());
  const featureInstances = scope.activateFeatures(features);
  return {
    featuresRuntime: new ApplicationFeaturesRuntime(scope, features, featureInstances),
    features,
    scope,
    routerRuntime,
    routing: null,
    components: { splash: <Probe label="splash" />, failed: <Probe label="failed" /> },
    createHref: () => '/',
    createRenderException: failure,
    failRender: vi.fn(async () => undefined),
    getLifecycle: () => lifecycle,
    getNavigation: () => navigation,
    getRouterRuntime: () => routerRuntime,
    requestBack: vi.fn(),
    routerBridge: {} as NativeRouterBridge,
    presentationRuntime: {
      getFrameSnapshot: () => null,
      subscribeFrame: () => () => undefined,
    } as unknown as NativePresentationRuntime,
    subscribeLifecycle: (listener: () => void) => {
      lifecycleListeners.add(listener);
      return () => {
        lifecycleListeners.delete(listener);
      };
    },
    subscribeNavigation: (listener: () => void) => {
      navigationListeners.add(listener);
      return () => {
        navigationListeners.delete(listener);
      };
    },
    changePhase: (phase: ApplicationLifecycleSnapshot['phase']) => {
      lifecycle = { phase, exception: phase === 'failed' ? failure(new Error('failed')) : null };
      lifecycleListeners.forEach((listener) => listener());
    },
    navigate: () => {
      navigation = { ...navigation };
      navigationListeners.forEach((listener) => listener());
    },
  };
};

afterEach(() => vi.restoreAllMocks());

for (const [name, Host, Layout, useDependency, useData, useSubmit, ControllerProvider] of [
  ['react', ReactHost, ReactLayout, useReactDependency, useReactData, useReactSubmit, ReactControllerProvider],
  ['fsm', FsmHost, FsmLayout, useFsmDependency, useFsmData, useFsmSubmit, FsmControllerProvider],
  ['native', NativeHost, NativeLayout, useNativeDependency, useNativeData, useNativeSubmit, NativeControllerProvider],
] as const) {
  describe(name + ' application feature lifecycle', () => {
    it('resolves feature data and actions below a nested controller runtime without changing ownership', async () => {
      @Controller()
      class Counter {
        loader() {
          return 'feature data';
        }
        async action() {
          return 'feature result';
        }
      }
      class CounterBindings {
        register(registry: BindingRegistryInterface) {
          registry.bind(Counter).toSelf().inSingletonScope();
        }
      }
      @UseBindings(CounterBindings)
      @Feature()
      class CounterFeature implements ApplicationFeatureInterface {}
      const Footer: React.FC = () => {
        const data = useData(Counter);
        const submit = useSubmit(Counter);
        return <button onClick={() => void submit()}>{submit.data ?? data}</button>;
      };
      const nestedGet = vi.fn(() => {
        throw new Error('wrong runtime');
      });
      const nested = { getController: nestedGet, getLoaderData: nestedGet } as unknown as ControllerRuntimeContextValue;
      @Layout({
        view: () => (
          <ControllerProvider value={nested}>
            <Footer />
          </ControllerProvider>
        ),
      })
      class FooterLayout {}
      const base = createSource([CounterFeature]);
      const featuresRuntime = base.featuresRuntime;
      const source = { ...base, layouts: [FooterLayout] };
      await featuresRuntime.load();
      source.changePhase('ready');
      const root = render(<Host source={source} />);
      try {
        fireEvent.click(screen.getByText('feature data'));
        await waitFor(() => expect(screen.getByText('feature result')).toBeInTheDocument());
        expect(nestedGet).not.toHaveBeenCalled();
      } finally {
        root.unmount();
        await featuresRuntime.dispose();
        await source.scope.disposeProviders();
        source.scope.dispose();
      }
    });
    it('keeps the wrapper across splash, ready, navigation and failure; supplies context to all layers', () => {
      const started = vi.fn();
      const stopped = vi.fn();
      const Wrapper: React.FC<React.PropsWithChildren> = (props) => {
        expect(useDependency(Dependency)).toBeInstanceOf(Dependency);
        React.useEffect(() => {
          started();
          return stopped;
        }, []);
        return <Context.Provider value="inside">{props.children}</Context.Provider>;
      };
      const Parent: React.FC<React.PropsWithChildren> = (props) => {
        expect(React.useContext(Context)).toBe('inside');
        return props.children;
      };
      @Layout({ view: () => <Probe label="layout" /> })
      class PageLayout {}
      const source = {
        ...createSource([
          createFeature({
            wrapper: Wrapper,
            presentation: { layer: 'application', view: <Probe label="application" /> },
          }),
          createFeature({ wrapper: Parent, presentation: { layer: 'modal', view: <Probe label="modal" /> } }),
          createFeature({ presentation: { layer: 'notification', view: <Probe label="notification" /> } }),
        ]),
        layouts: [PageLayout],
      };
      const root = render(<Host source={source} />);
      expect(screen.getByText('splash:inside')).toBeInTheDocument();
      expect(screen.queryByText('modal:inside')).toBeNull();
      act(() => source.changePhase('ready'));
      for (const layer of ['layout', 'application', 'modal', 'notification']) {
        expect(screen.getByText(layer + ':inside')).toBeInTheDocument();
      }
      act(() => source.navigate());
      root.rerender(<Host source={source} />);
      act(() => source.changePhase('failed'));
      expect(screen.getByText('failed:inside')).toBeInTheDocument();
      expect(started).toHaveBeenCalledTimes(1);
      expect(stopped).not.toHaveBeenCalled();
      act(() => source.changePhase('disposed'));
      expect(stopped).toHaveBeenCalledTimes(1);
      root.unmount();
      source.scope.dispose();
    });

    it('retains feature context for a content error but bypasses a broken wrapper', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('render failed');
      const Broken: React.FC = () => {
        throw error;
      };
      const Wrapper: React.FC<React.PropsWithChildren> = (props) => (
        <Context.Provider value="inside">{props.children}</Context.Provider>
      );
      @Layout({ view: Broken })
      class BrokenLayout {}
      const source = { ...createSource([createFeature({ wrapper: Wrapper })]), layouts: [BrokenLayout] };
      source.changePhase('ready');
      const first = render(<Host source={source} />);
      expect(screen.getByText('failed:inside')).toBeInTheDocument();
      expect(source.failRender).toHaveBeenCalledWith(error);
      first.unmount();
      source.scope.dispose();
      const broken = { ...createSource([createFeature({ wrapper: Broken })]), layouts: [] };
      const second = render(<Host source={broken} />);
      expect(screen.getByText('failed:outside')).toBeInTheDocument();
      expect(broken.failRender).toHaveBeenCalledWith(error);
      second.unmount();
      broken.scope.dispose();
    });

    it('isolates applications and balances StrictMode subscriptions', () => {
      const active = new Set<object>();
      const Wrapper: React.FC<React.PropsWithChildren> = (props) => {
        const [identity] = React.useState(() => ({}));
        React.useEffect(() => {
          active.add(identity);
          return () => {
            active.delete(identity);
          };
        }, [identity]);
        return props.children;
      };
      const feature = createFeature({ wrapper: Wrapper });
      const first = { ...createSource([feature]), layouts: [] };
      const second = { ...createSource([feature]), layouts: [] };
      const firstRoot = render(
        <React.StrictMode>
          <Host source={first} />
        </React.StrictMode>,
      );
      const secondRoot = render(
        <React.StrictMode>
          <Host source={second} />
        </React.StrictMode>,
      );
      expect(active.size).toBe(2);
      firstRoot.unmount();
      expect(active.size).toBe(1);
      secondRoot.unmount();
      expect(active.size).toBe(0);
      first.scope.dispose();
      second.scope.dispose();
    });
  });
}
