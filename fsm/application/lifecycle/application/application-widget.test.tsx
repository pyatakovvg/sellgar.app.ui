import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Controller,
  Feature,
  Inject,
  Provider,
  UseBindings,
  segments,
  type BindingRegistryInterface,
  type ApplicationFeatureInterface,
  type ProviderInterface,
  type ProviderPrepareContextInterface,
} from '../../../../core';
import {
  Application,
  Module,
  Route,
  Router,
  Widget,
  WidgetDefinition,
  WidgetHost,
  WidgetPreloaderInterface,
  createFsmRouterBridge,
  useLoaderData,
  type ApplicationConfiguratorInterface,
  type FsmSnapshotSourceListener,
} from '../../../index';

describe('FSM application widget preload', () => {
  it('holds startup splash until a module-owned widget is ready and reuses it when rendered', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loaded = vi.fn();
    const disposed = vi.fn();
    @Controller()
    class Data {
      async loader() {
        loaded();
        await gate;
        return 'ready widget';
      }
      dispose = disposed;
    }
    class Bindings {
      register(registry: BindingRegistryInterface) {
        registry.bind(Data).toSelf();
      }
    }
    @Controller()
    class FeatureData {
      loader() {
        return 'feature data';
      }
    }
    class FeatureBindings {
      register(registry: BindingRegistryInterface) {
        registry.bind(FeatureData).toSelf();
      }
    }
    @UseBindings(FeatureBindings)
    @Feature()
    class TestFeature implements ApplicationFeatureInterface {}
    const View: React.FC = () => (
      <span>
        {useLoaderData(Data)} / {useLoaderData(FeatureData)}
      </span>
    );
    @UseBindings(Bindings)
    @Widget({ view: View })
    class Child extends WidgetDefinition {}
    @Provider()
    class Preload implements ProviderInterface {
      constructor(@Inject(WidgetPreloaderInterface) private readonly widgets: WidgetPreloaderInterface) {}
      prepare(context: ProviderPrepareContextInterface) {
        return this.widgets.preload(context, Child);
      }
      dispose() {}
    }
    @Module({ providers: [Preload], view: () => <WidgetHost token={Child} /> })
    class Screen {}
    class ScreenToken {}
    class App extends Application {
      protected configure(app: ApplicationConfiguratorInterface): void {
        app.features([TestFeature]);
        app.components({ splash: <span>startup</span> });
        app.router(
          new Router({
            routes: [new Route({ token: ScreenToken, address: segments('screen'), load: async () => ({ Screen }) })],
          }),
        );
      }
    }
    let publish: FsmSnapshotSourceListener<{ screen: string }> = () => {
      throw new Error('not subscribed');
    };
    const subscribed = vi.fn();
    const sourceDisposed = vi.fn(async () => {});
    const app = new App({
      routerBridge: createFsmRouterBridge({
        routingKey: 'screen',
        source: {
          subscribe(listener) {
            publish = listener;
            subscribed();
            return { dispose: sourceDisposed };
          },
        },
      }),
    });
    app.compose();
    const AppView = app.createView();
    const root = render(<AppView />);
    let startup = Promise.resolve();
    act(() => {
      startup = app.initialize();
    });
    try {
      await waitFor(() => expect(subscribed).toHaveBeenCalledTimes(1));
      act(() => {
        void publish({ screen: 'screen' });
      });
      await waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
      expect(app.lifecycle.phase).toBe('initializing');
      expect(screen.getByText('startup')).toBeInTheDocument();
      expect(screen.queryByText('ready widget / feature data')).toBeNull();
      await act(async () => {
        release();
        await startup;
      });
      await screen.findByText('ready widget / feature data');
      expect(app.lifecycle.phase).toBe('ready');
      expect(loaded).toHaveBeenCalledTimes(1);
    } finally {
      release();
      root.unmount();
      await app.dispose();
    }
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(sourceDisposed).toHaveBeenCalledTimes(1);
  });
});
