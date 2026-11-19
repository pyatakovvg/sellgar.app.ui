import { describe, expect, it, vi } from 'vitest';

import type { RuntimeContextInterface } from '../../../../core/runtime/context/runtime-context';
import {
  ApplicationReporterInterface,
  type ApplicationReport,
  type ApplicationReportHandlerInterface,
} from '../../../../core/application/reporting/application-report';
import { Reporter } from '../../../../core/application/reporting/reporter';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { segments } from '../../../../core/router/declaration/address';
import { createNativeRouterBridge, resolveNativeRouterBridge } from '../../../router/bridge/native-router-bridge';
import { Module } from '../../../module/declaration/module';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Application } from './application';

// Rendering and OS linking are outside this application-context contract.
vi.mock('../../rendering/application-host', () => ({ createApplicationView: vi.fn() }));
vi.mock('../../../router/runtime/native-back-runtime', () => ({ NativeBackRuntime: vi.fn() }));
vi.mock('../../../router/runtime/native-presentation-runtime', () => ({ NativePresentationRuntime: vi.fn() }));
vi.mock('../../../router/transport/native-linking-transport', () => ({ createNativeLinkingTransport: vi.fn() }));

@Module({ view: () => null })
class PageModule {}
class Products {}
class Details {}

describe('Native application reporter context', () => {
  it('reads current state across navigation and retained history through the shared context', async () => {
    const first = { selected: 'products' };
    const second = { selected: 'details' };
    const reference = createNativeRouterBridge({
      transport: {
        getInitialLocation: async () => ({ address: ['products'], nested: null, query: {}, state: first }),
        subscribe: () => () => undefined,
      },
    });
    const bridge = resolveNativeRouterBridge(reference);
    const contexts: RuntimeContextInterface[] = [];
    const states: unknown[] = [];
    const initialize = vi.fn();
    @Reporter()
    class ContextReporter implements ApplicationReportHandlerInterface {
      initialize(context: RuntimeContextInterface): void {
        contexts.push(context);
        initialize(context.app.location);
      }
      report(_report: ApplicationReport, context: RuntimeContextInterface): void {
        contexts.push(context);
        states.push(context.app.location?.state);
      }
    }
    class NativeApplication extends Application {
      protected configure(config: ApplicationConfiguratorInterface): void {
        config.router(
          new Router({
            routes: [
              new Route({ token: Products, address: segments('products'), load: async () => ({ PageModule }) }),
              new Route({ token: Details, address: segments('details'), load: async () => ({ PageModule }) }),
            ],
          }),
        );
      }
      get navigate() {
        return this.getApplicationScope().get(NavigateServiceInterface);
      }
      report(): void {
        this.getApplicationScope().get(ApplicationReporterInterface).info({ event: 'native.state' });
      }
    }
    const app = new NativeApplication({ routerBridge: reference });
    app.reporter([ContextReporter]);
    app.compose();
    await app.initialize();
    const listener = vi.fn();
    const unsubscribe = app.subscribeLocation(listener);
    try {
      expect(initialize).toHaveBeenCalledExactlyOnceWith(null);
      app.report();
      await vi.waitFor(() => expect(states).toEqual([first]));
      await app.navigate.to(Details, { state: second });
      app.report();
      await vi.waitFor(() => expect(states).toEqual([first, second]));
      await bridge.back();
      app.report();
      await vi.waitFor(() => expect(states).toEqual([first, second, first]));
      expect(listener.mock.calls.map(([location]) => location.state)).toEqual([second, first]);
      expect(contexts.every((context) => context === contexts[0] && context.app === app)).toBe(true);
      unsubscribe();
      await app.navigate.to(Details);
      expect(app.location?.state).toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      await app.dispose();
    }
    expect(contexts[0]!.signal.aborted).toBe(true);
  });
});
