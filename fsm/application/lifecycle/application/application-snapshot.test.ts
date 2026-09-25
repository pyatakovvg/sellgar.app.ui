import { describe, expect, it, vi } from 'vitest';
import { LocationServiceInterface } from '../../../../core/router/service/location-service';
import { RouteScope } from '../../../../core/runtime/scope/kind/route-scope';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import { Router } from '../../../router/declaration/router';
import { Route } from '../../../router/declaration/route';
import { segments } from '../../../../core/router/declaration/address';
import { SnapshotServiceInterface } from '../../../service/snapshot-service';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Application } from './application';

class Ui {
  constructor(readonly language = 'ru') {}
}

class TestRoute {}

class TestApplication extends Application {
  readonly router = new Router({
    routes: [new Route({ token: TestRoute, address: segments('test'), load: async () => ({}) })],
  });

  get scope() {
    return this.getApplicationScope();
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(this.router);
  }
}

const createApplication = () =>
  new TestApplication({
    routerBridge: {
      runtimeRetention: 'release',
      initialize: vi.fn(),
      commit: vi.fn(),
      dispose: vi.fn(),
      back: vi.fn(),
    },
  });

const navigation = (app: TestApplication, state: unknown): NavigationState => ({
  state,
  boundary: null,
  initiator: null,
  pendingNestedAddress: null,
  replace: false,
  revalidation: null,
  root: { child: null, owner: null, path: [], query: {}, router: app.router },
});

describe('FSM application snapshot service', () => {
  it('is application-scoped even when first requested by a route with a staged location', async () => {
    const app = createApplication();
    app.compose();
    const committed = new Ui('ru');
    const staged = new Ui('en');
    app.scope.syncLocation(navigation(app, { ui: committed }));
    const child = new RouteScope(app.scope, (registry) => {
      registry.bind(LocationServiceInterface).toConstantValue({
        location: { params: {}, state: { ui: staged } },
        paramsToObject: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      });
    });
    try {
      const fromRoute = child.get(SnapshotServiceInterface);
      expect(fromRoute).toBe(app.scope.get(SnapshotServiceInterface));
      expect(fromRoute.get(Ui)).toBe(committed);
      const listener = vi.fn();
      const unsubscribe = fromRoute.subscribe(Ui, listener);
      expect(listener).not.toHaveBeenCalled();
      app.scope.syncLocation(navigation(app, { ui: staged }));
      expect(fromRoute.get(Ui)).toBe(staged);
      expect(listener).toHaveBeenCalledExactlyOnceWith(staged);
      unsubscribe();
      app.scope.syncLocation(navigation(app, { ui: committed }));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      child.dispose();
      await app.dispose();
    }
  });

  it('does not share snapshots between applications', async () => {
    const first = createApplication();
    const second = createApplication();
    first.compose();
    second.compose();
    const listener = vi.fn();
    const unsubscribe = second.scope.get(SnapshotServiceInterface).subscribe(Ui, listener);
    try {
      first.scope.syncLocation(navigation(first, { ui: new Ui() }));
      expect(first.scope.get(SnapshotServiceInterface)).not.toBe(second.scope.get(SnapshotServiceInterface));
      expect(second.scope.get(SnapshotServiceInterface).get(Ui)).toBeNull();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      await first.dispose();
      await second.dispose();
    }
  });
});
