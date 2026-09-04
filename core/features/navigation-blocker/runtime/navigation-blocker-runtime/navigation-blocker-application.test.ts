import { describe, expect, it, vi } from 'vitest';

import { ApplicationConfig } from '../../../../application/config/application-config';
import type { ApplicationConfiguratorInterface } from '../../../../application/config/application-configurator';
import { Application } from '../../../../application/lifecycle/application';
import { ApplicationFeatureInterface } from '../../../../application/feature/application-feature';
import { UseBindings } from '../../../../di/composition/use-bindings';
import { createModuleRuntimeDefinition } from '../../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../../module/resolution/module-export-resolver';
import { segments } from '../../../../router/declaration/address';
import { Route } from '../../../../router/declaration/route';
import { getRouterDefinition, Router } from '../../../../router/declaration/router';
import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
} from '../../../../router/bridge/router-bridge';
import type { NavigationState } from '../../../../router/runtime/navigation-state';
import { NavigateServiceInterface } from '../../../../router/service/navigate-service';
import { NavigationBlockerBindings } from '../../binding/navigation-blocker-bindings';
import { NavigationBlockerServiceInterface } from '../../contract/navigation-blocker-service';
import { NavigationBlockerRuntimeInterface } from './navigation-blocker-runtime.interface.ts';

class FirstRoute {}
class SecondRoute {}
class TestModule {}

const router = new Router({
  routes: [
    new Route({ address: segments('first'), load: async () => ({}), token: FirstRoute }),
    new Route({ address: segments('second'), load: async () => ({}), token: SecondRoute }),
  ],
});

@UseBindings(NavigationBlockerBindings)
class TestNavigationBlockerFeature extends ApplicationFeatureInterface {}

class TestModuleExportResolver implements ModuleExportResolverInterface<null> {
  resolve() {
    return createModuleRuntimeDefinition({ presentation: null, token: TestModule });
  }
}

class TestRouterBridge implements RouterBridgeInterface {
  readonly runtimeRetention = 'retain' as const;
  readonly commits: NavigationState[] = [];
  context: RouterBridgeInitializeContextInterface | null = null;

  back(): void {}

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    this.context = context;
    await context.navigate.to(FirstRoute);
  }

  commit(navigation: NavigationState, _context: RouterBridgeCommitContextInterface): void {
    this.commits.push(navigation);
  }

  dispose(): void {}
}

class TestApplication extends Application<null> {
  private readonly testConfig: ApplicationConfig;

  constructor(bridge: RouterBridgeInterface) {
    const config = new ApplicationConfig();

    super(bridge, config, new TestModuleExportResolver());
    this.testConfig = config;
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
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
    app.features([new TestNavigationBlockerFeature()]);
    app.router(router);
  }
}

describe('NavigationBlocker Application pipeline', () => {
  it('commits a transition after leave and preserves the current branch after stay', async () => {
    const bridge = new TestRouterBridge();
    const app = new TestApplication(bridge);

    app.compose();
    await app.initialize();
    app.blocker.register(() => true);

    expect(bridge.context!.shouldBlockUnload()).toBe(true);

    const stayedNavigation = app.navigate.to(SecondRoute);

    await vi.waitFor(() => expect(app.blockerRuntime.getSnapshot()).not.toBeNull());
    app.blockerRuntime.stay();
    await stayedNavigation;

    expect(bridge.commits).toHaveLength(1);

    const leftNavigation = app.navigate.to(SecondRoute);

    await vi.waitFor(() => expect(app.blockerRuntime.getSnapshot()).not.toBeNull());
    app.blockerRuntime.leave();
    await leftNavigation;

    expect(bridge.commits).toHaveLength(2);
    expect(bridge.commits.at(-1)?.root.path.at(-1)?.route).toBe(getRouterDefinition(router).routes[1]);
    expect(app.blockerRuntime.getSnapshot()).toBeNull();

    await app.dispose();
  });

  it('confirms an external transition before transport commit and reuses that decision during restore', async () => {
    const bridge = new TestRouterBridge();
    const app = new TestApplication(bridge);

    app.compose();
    await app.initialize();
    app.blocker.register(() => true);

    const location = {
      address: ['second'],
      nested: null,
      query: {},
      state: null,
    };
    const confirmation = bridge.context!.confirm(location, new AbortController().signal);

    await vi.waitFor(() => expect(app.blockerRuntime.getSnapshot()).not.toBeNull());
    app.blockerRuntime.leave();

    await expect(confirmation).resolves.toBe(true);
    expect(bridge.commits).toHaveLength(1);

    await app.navigate.to(SecondRoute);

    expect(bridge.commits).toHaveLength(1);
    expect(app.blockerRuntime.getSnapshot()).toBeNull();
    expect(app.blockerRuntime.hasAcceptedDecision()).toBe(true);

    await expect(bridge.context!.restore(location, { blockersConfirmed: true })).resolves.toBe(true);
    expect(bridge.commits).toHaveLength(2);
    expect(app.blockerRuntime.getSnapshot()).toBeNull();

    await app.dispose();
  });
});
