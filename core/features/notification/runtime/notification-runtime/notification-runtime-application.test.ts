import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApplicationConfig } from '../../../../application/config/application-config';
import type { ApplicationConfiguratorInterface } from '../../../../application/config/application-configurator';
import { ApplicationFeatureInterface } from '../../../../application/feature/application-feature';
import { Application } from '../../../../application/lifecycle/application';
import { UseBindings } from '../../../../di/composition/use-bindings';
import { createModuleRuntimeDefinition } from '../../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../../module/resolution/module-export-resolver';
import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
} from '../../../../router/bridge/router-bridge';
import { segments } from '../../../../router/declaration/address';
import { Route } from '../../../../router/declaration/route';
import { Router } from '../../../../router/declaration/router';
import { NavigateServiceInterface } from '../../../../router/service/navigate-service';
import type { NavigationState } from '../../../../router/runtime/navigation-state';
import { NotificationBindings } from '../../binding/notification-bindings';
import { NotificationServiceInterface } from '../../contract/notification-service';
import { NotificationRuntimeInterface } from './notification-runtime.interface.ts';

class FirstRoute {}
class SecondRoute {}
class TestModule {}

const router = new Router({
  routes: [
    new Route({ address: segments('first'), load: async () => ({}), token: FirstRoute }),
    new Route({ address: segments('second'), load: async () => ({}), token: SecondRoute }),
  ],
});

@UseBindings(NotificationBindings)
class TestNotificationFeature extends ApplicationFeatureInterface {}

class TestModuleExportResolver implements ModuleExportResolverInterface<null> {
  resolve() {
    return createModuleRuntimeDefinition({ presentation: null, token: TestModule });
  }
}

class TestRouterBridge implements RouterBridgeInterface {
  readonly runtimeRetention = 'retain' as const;

  async initialize(context: RouterBridgeInitializeContextInterface): Promise<void> {
    await context.navigate.to(FirstRoute);
  }

  back(): void {}

  commit(_navigation: NavigationState, _context: RouterBridgeCommitContextInterface): void {}

  dispose(): void {}
}

class TestApplication extends Application<null> {
  private readonly testConfig: ApplicationConfig;

  constructor() {
    const config = new ApplicationConfig();

    super(new TestRouterBridge(), config, new TestModuleExportResolver());
    this.testConfig = config;
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get notifications(): NotificationServiceInterface {
    return this.getApplicationScope().get(NotificationServiceInterface);
  }

  get notificationRuntime(): NotificationRuntimeInterface {
    return this.getApplicationScope().get(NotificationRuntimeInterface);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([new TestNotificationFeature()]);
    app.router(router);
  }
}

describe('NotificationRuntime application lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps one runtime across route transitions and disposes it with the application', async () => {
    const app = new TestApplication();

    app.compose();
    await app.initialize();

    const service = app.notifications;
    const runtime = app.notificationRuntime;

    service.show({ autoClose: true, title: 'Application scoped' });
    await app.navigate.to(SecondRoute);

    expect(app.notifications).toBe(service);
    expect(app.notificationRuntime).toBe(runtime);
    expect(runtime.getSnapshot()).toHaveLength(1);

    await app.dispose();
    vi.advanceTimersByTime(5000);

    expect(runtime.getSnapshot()).toEqual([]);
  });
});
