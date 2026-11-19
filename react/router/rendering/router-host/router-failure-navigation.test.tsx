import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import type {
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
} from '../../../../core/router/bridge/router-bridge';
import { segments } from '../../../../core/router/declaration/address';
import { Controller } from '../../../../core/controller/contract/controller';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { Provider, type ProviderInterface } from '../../../../core/runtime/provider/provider';
import { Application } from '../../../application/lifecycle/application';
import type { ApplicationConfiguratorInterface } from '../../../application/config/application-configurator';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import { Module } from '../../../module/declaration/module';
import { useException } from '../../../runtime/exception/exception-context';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';

class BrokenRoute {}
class TargetRoute {}

const Failure = () => <span>screen failed: {String(useException().cause)}</span>;

const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
  cleanup();
  for (const dispose of disposals.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

class TestBridge implements RouterBridgeInterface {
  readonly runtimeRetention = 'release' as const;
  private context: RouterBridgeInitializeContextInterface | null = null;

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    this.context = context;
    await context.navigate.to(BrokenRoute);
  }

  async back(): Promise<void> {
    await this.context?.back();
  }

  commit(): void {}
  dispose(): void {}
}

class TestApplication extends Application {
  constructor(private readonly router: Router) {
    super({ routerBridge: new TestBridge() });
  }

  get navigate() {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get routes() {
    return this.getRouterRuntime().getActiveLocalRouteRuntimes();
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(this.router);
    app.components({ fallback: <span>loading target</span>, exception: <Failure /> });
  }
}

describe('navigation after a failed child module', () => {
  it.each(['load', 'loader', 'render'] as const)(
    'preserves the parent layout and provider after a %s failure',
    async (failure) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const initialize = vi.fn();
      const dispose = vi.fn();
      let failLoad = failure === 'load';
      let failLoader = failure === 'loader';
      let releaseTarget!: () => void;
      const target = new Promise<void>((resolve) => {
        releaseTarget = resolve;
      });

      @Provider()
      class ShellProvider implements ProviderInterface {
        initialize(): void {
          initialize();
        }

        dispose(): void {
          dispose();
        }
      }

      @Layout({
        view: ({ children }: LayoutViewProps) => {
          const [count, setCount] = React.useState(0);
          return (
            <section data-testid="shell">
              <button onClick={() => setCount(count + 1)}>shell {count}</button>
              {children}
            </section>
          );
        },
      })
      class ShellLayout {}

      @Controller()
      class TestController {
        loader(): void {
          if (failLoader) {
            failLoader = false;
            throw new Error('Module loader failed');
          }
        }
      }

      class TestBindings {
        register(registry: BindingRegistryInterface): void {
          registry.bind(TestController).toSelf();
        }
      }

      @UseBindings(TestBindings)
      @Module({ view: () => <span>module ready</span> })
      class TestModule {}

      const app = new TestApplication(
        new Router({
          routes: [
            new Route({
              layouts: [ShellLayout],
              providers: [ShellProvider],
              routes: [
                new Route({
                  token: BrokenRoute,
                  address: segments('broken'),
                  load: async () => {
                    if (failLoad) {
                      failLoad = false;
                      throw new Error('Module load failed');
                    }
                    return { TestModule };
                  },
                }),
                new Route({
                  token: TargetRoute,
                  address: segments('target'),
                  load: async () => {
                    await target;
                    return { TestModule };
                  },
                }),
              ],
            }),
          ],
        }),
      );
      app.compose();
      disposals.push(async () => {
        releaseTarget();
        await app.dispose();
      });
      await app.initialize();
      if (failure === 'render') await app.routes[1]!.getModuleRuntime().failRender(new Error('Module render failed'));

      const AppView = app.createView();
      render(<AppView />);
      expect(screen.getByText(`screen failed: Error: Module ${failure} failed`)).toBeInTheDocument();
      const shell = screen.getByTestId('shell');
      const button = screen.getByRole('button');
      fireEvent.click(button);
      const parent = app.routes[0];
      const failedRoute = app.routes[1];
      let navigation!: Promise<void>;

      try {
        await act(async () => {
          navigation = app.navigate.to(TargetRoute);
        });
        await waitFor(() => expect(screen.getByText('loading target')).toBeInTheDocument());
        expect(screen.getByTestId('shell')).toBe(shell);
        expect(screen.getByRole('button')).toBe(button);
        expect(button).toHaveTextContent('shell 1');
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(dispose).not.toHaveBeenCalled();

        await act(async () => {
          releaseTarget();
          await navigation;
        });
        expect(screen.getByText('module ready')).toBeInTheDocument();
        expect(screen.getByTestId('shell')).toBe(shell);
        expect(app.routes[0]).toBe(parent);
        expect(button).toHaveTextContent('shell 1');

        await act(async () => {
          await app.navigate.to(BrokenRoute);
        });
        expect(app.routes[1]).not.toBe(failedRoute);
        expect(screen.getByText('module ready')).toBeInTheDocument();
        expect(screen.getByTestId('shell')).toBe(shell);
        expect(button).toHaveTextContent('shell 1');
        expect(initialize).toHaveBeenCalledTimes(1);
        expect(dispose).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          releaseTarget();
          await navigation;
        });
      }
    },
  );
});
