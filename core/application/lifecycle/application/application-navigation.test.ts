import { afterEach, describe, expect, it, vi } from 'vitest';

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
import { matchesNavigationRoute } from '../../../router/runtime/navigation-state';
import type { NavigationState } from '../../../router/runtime/navigation-state';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { ApplicationConfig } from '../../config/application-config';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';

import { Application } from './application.ts';
import type { ApplicationNavigationSnapshot } from './application.ts';

abstract class FirstRoute {}
abstract class SecondRoute {}
class TestModule {}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  reject(reason?: unknown): void;
  resolve(value: TValue): void;
}

let secondRouteDeferred: Deferred<void> | null = null;

const router = new Router({
  routes: [
    new Route({ address: segments('first'), load: async () => ({}), token: FirstRoute }),
    new Route({
      address: segments('second'),
      load: async () => {
        await secondRouteDeferred?.promise;
        return {};
      },
      token: SecondRoute,
    }),
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

  get navigation(): ApplicationNavigationSnapshot {
    return this.getNavigationSnapshot();
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  onNavigation(listener: () => void): () => void {
    return this.subscribeNavigation(listener);
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(router);
  }
}

describe('Application pending navigation', () => {
  afterEach(() => {
    secondRouteDeferred = null;
  });

  it('publishes the target while preserving the committed navigation', async () => {
    const app = await createApplication();
    const listener = vi.fn();
    const unsubscribe = app.onNavigation(listener);

    secondRouteDeferred = createDeferred<void>();
    const transition = app.navigate.to(SecondRoute);

    expect(matchesNavigationRoute(app.navigation.navigation, FirstRoute)).toBe(true);
    expect(matchesNavigationRoute(app.navigation.pending, SecondRoute)).toBe(true);

    secondRouteDeferred.resolve();
    await transition;

    expect(matchesNavigationRoute(app.navigation.navigation, SecondRoute)).toBe(true);
    expect(app.navigation.pending).toBeNull();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    await app.dispose();
  });

  it('clears the target when navigation fails', async () => {
    const app = await createApplication();
    const error = new Error('Second route failed.');
    const consoleError = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);

    try {
      secondRouteDeferred = createDeferred<void>();
      const transition = app.navigate.to(SecondRoute);

      expect(matchesNavigationRoute(app.navigation.pending, SecondRoute)).toBe(true);

      secondRouteDeferred.reject(error);

      await expect(transition).resolves.toBeUndefined();
      expect(app.navigation.pending).toBeNull();
    } finally {
      consoleError.mockRestore();
      await app.dispose();
    }
  });

  it('replaces the pending target immediately when navigation is superseded', async () => {
    const app = await createApplication();

    secondRouteDeferred = createDeferred<void>();
    const secondTransition = app.navigate.to(SecondRoute);

    expect(matchesNavigationRoute(app.navigation.pending, SecondRoute)).toBe(true);

    const firstTransition = app.navigate.to(FirstRoute);

    expect(matchesNavigationRoute(app.navigation.pending, FirstRoute)).toBe(true);

    secondRouteDeferred.resolve();
    await Promise.all([secondTransition, firstTransition]);

    expect(matchesNavigationRoute(app.navigation.navigation, FirstRoute)).toBe(true);
    expect(app.navigation.pending).toBeNull();

    await app.dispose();
  });
});

const createApplication = async (): Promise<TestApplication> => {
  const app = new TestApplication();

  app.compose();
  await app.initialize();

  return app;
};

const createDeferred = <TValue>(): Deferred<TValue> => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve };
};
