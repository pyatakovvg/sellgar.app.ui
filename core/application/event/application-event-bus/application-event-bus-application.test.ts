import { describe, expect, it, vi } from 'vitest';

import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Application } from '../../lifecycle/application';
import { createModuleRuntimeDefinition } from '../../../module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type {
  RouterBridgeCommitContextInterface,
  RouterBridgeInitializeContextInterface,
  RouterBridgeInterface,
} from '../../../router/bridge/router-bridge';
import { segments } from '../../../router/declaration/address';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import type { NavigationState } from '../../../router/runtime/navigation-state';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';

import { ApplicationEventBusInterface } from './application-event-bus.interface.ts';

class FirstRoute {}
class SecondRoute {}
class TestModule {}

abstract class ApplicationUpdatedEvent {
  declare readonly revision: number;
}

const router = new Router({
  routes: [
    new Route({ address: segments('first'), load: async () => ({}), token: FirstRoute }),
    new Route({ address: segments('second'), load: async () => ({}), token: SecondRoute }),
  ],
});

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
  constructor() {
    super(new TestRouterBridge(), new ApplicationConfig(), new TestModuleExportResolver());
  }

  get events(): ApplicationEventBusInterface {
    return this.getApplicationScope().get(ApplicationEventBusInterface);
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(router);
  }
}

describe('ApplicationEventBus application lifetime', () => {
  it('keeps one bus across route transitions and clears it with the application', async () => {
    const app = new TestApplication();
    const handler = vi.fn();

    app.compose();
    await app.initialize();

    const events = app.events;

    events.subscribe(ApplicationUpdatedEvent, handler);
    await app.navigate.to(SecondRoute);

    expect(app.events).toBe(events);

    await events.publish(ApplicationUpdatedEvent, { revision: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    await app.dispose();
    await events.publish(ApplicationUpdatedEvent, { revision: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
