import { describe, expect, it } from 'vitest';

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
import { UserRequestBindings } from '../../binding/user-request-bindings';
import { UserRequestServiceInterface } from '../../contract/user-request-service';
import { UserRequestRuntimeInterface } from './user-request-runtime.interface.ts';

class FirstRoute {}
class SecondRoute {}
class TestModule {}

const router = new Router({
  routes: [
    new Route({ address: segments('first'), load: async () => ({}), token: FirstRoute }),
    new Route({ address: segments('second'), load: async () => ({}), token: SecondRoute }),
  ],
});

@UseBindings(UserRequestBindings)
class TestUserRequestFeature extends ApplicationFeatureInterface {}

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

  get requests(): UserRequestServiceInterface {
    return this.getApplicationScope().get(UserRequestServiceInterface);
  }

  get requestRuntime(): UserRequestRuntimeInterface {
    return this.getApplicationScope().get(UserRequestRuntimeInterface);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([new TestUserRequestFeature()]);
    app.router(router);
  }
}

describe('UserRequestRuntime application lifetime', () => {
  it('keeps one FIFO runtime across route transitions and disposes it with the application', async () => {
    const app = new TestApplication();

    app.compose();
    await app.initialize();

    const service = app.requests;
    const runtime = app.requestRuntime;
    const result = service.confirm({ title: 'Application scoped' });

    await app.navigate.to(SecondRoute);

    expect(app.requests).toBe(service);
    expect(app.requestRuntime).toBe(runtime);
    expect(runtime.getSnapshot()?.payload.title).toBe('Application scoped');

    await app.dispose();

    await expect(result).resolves.toBe(false);
    expect(runtime.getSnapshot()).toBeNull();
  });
});
