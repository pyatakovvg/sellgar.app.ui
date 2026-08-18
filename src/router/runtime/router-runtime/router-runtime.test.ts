import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { FrameRoute, FrameRouter } from '../../../frame/router/declaration';
import { FrameRouterRuntime } from '../../../frame/router/runtime';
import { ApplicationScope } from '../../../runtime/scope/kind';
import type { RuntimeScope } from '../../../runtime/scope/base';
import { RouterServiceBindings } from '../../service/router-service';
import { NavigateServiceInterface } from '../../service/navigate-service';

import { RouterRuntime, type RouteRuntimeHandle } from './';

describe('RouterRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits active routes and disposes the route that leaves the active branch', async () => {
    const runtime = new RouterRuntime();
    const previous = createRouteRuntimeHandle();
    const next = createRouteRuntimeHandle();

    runtime.register('previous', previous);
    runtime.register('next', next);
    runtime.syncActiveRoutes(['previous']);
    runtime.syncActiveRoutes(['next']);
    await Promise.resolve();

    expect(previous.commit).toHaveBeenCalledOnce();
    expect(previous.discardPending).toHaveBeenCalledOnce();
    expect(previous.dispose).toHaveBeenCalledOnce();
    expect(next.commit).toHaveBeenCalledOnce();
  });

  it('matches FrameRouter only from the active ordinary route branch', () => {
    const runtime = new RouterRuntime();
    const scope = createScope(runtime);
    const employees = createFrameRouter('employees/:id');
    const invitations = createFrameRouter('employee-invitations/:id');

    runtime.register('employees', createRouteRuntimeHandle(scope), { frames: [employees] });
    runtime.register('invitations', createRouteRuntimeHandle(scope), { frames: [invitations] });
    runtime.syncActiveRoutes(['employees']);

    expect(runtime.resolveActiveFrame(['employees'], '#employees/42')).toMatchObject({
      kind: 'router',
      match: { params: { id: '42' }, router: employees },
      runtimeKey: 'employees',
    });
    expect(runtime.resolveActiveFrame(['employees'], '#employee-invitations/42')).toBeNull();
  });

  it('lets the nearest active ordinary route own an overlapping frame source', () => {
    const runtime = new RouterRuntime();
    const scope = createScope(runtime);
    const parent = createFrameRouter('employees/:id');
    const child = createFrameRouter('employees/:id');

    runtime.register('parent', createRouteRuntimeHandle(scope), { frames: [parent] });
    runtime.register('child', createRouteRuntimeHandle(scope), { frames: [child] });
    runtime.syncActiveRoutes(['parent', 'child']);

    expect(runtime.resolveActiveFrame(['parent', 'child'], '#employees/42')?.match.router).toBe(child);
  });

  it('invalidates active routes without disposing them before the next route sync', async () => {
    const runtime = new RouterRuntime();
    const route = createRouteRuntimeHandle();

    runtime.register('employees', route);
    runtime.syncActiveRoutes(['employees']);
    runtime.invalidateActiveRoutes();
    await Promise.resolve();

    expect(route.dispose).not.toHaveBeenCalled();
    expect(runtime.get('employees')).toBe(route);
  });

  it('preloads a frame from the destination route branch before that branch becomes active', async () => {
    const runtime = new RouterRuntime();
    const scope = createScope(runtime);
    const employees = createFrameRouter('employees/:id');
    const load = vi.spyOn(FrameRouterRuntime.prototype, 'load').mockResolvedValue();

    runtime.register('terminals', createRouteRuntimeHandle(scope));
    runtime.register('employees', createRouteRuntimeHandle(scope), { frames: [employees] });
    runtime.syncActiveRoutes(['terminals']);
    const activation = runtime.trackRouteActivation('employees', 'https://example.test/employees#employees/42');

    const preloading = runtime.preloadFrame(['employees'], '#employees/42', {
      app: {} as never,
      location: {
        hash: '#employees/42',
        hashParams: {},
        key: 'https://example.test/employees#employees/42',
        params: {},
        pathname: '/employees',
        search: '',
        searchParams: {},
        state: null,
      },
      navigateService: scope.get(NavigateServiceInterface),
      session: new SessionRuntimeState(),
      signal: new AbortController().signal,
    });

    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();

    activation.activate();
    activation.complete();
    await preloading;

    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '42' },
        router: employees,
      }),
      expect.objectContaining({
        location: expect.objectContaining({ pathname: '/employees' }),
      }),
    );
  });

  it('does not preload a frame when the destination route branch rejects activation', async () => {
    const runtime = new RouterRuntime();
    const scope = createScope(runtime);
    const employees = createFrameRouter('employees/:id');
    const load = vi.spyOn(FrameRouterRuntime.prototype, 'load').mockResolvedValue();
    const navigationKey = 'https://example.test/employees#employees/42';
    const activation = runtime.trackRouteActivation('employees', navigationKey);

    runtime.register('employees', createRouteRuntimeHandle(scope), { frames: [employees] });
    const preloading = runtime.preloadFrame(['employees'], '#employees/42', {
      app: {} as never,
      location: {
        hash: '#employees/42',
        hashParams: {},
        key: navigationKey,
        params: {},
        pathname: '/employees',
        search: '',
        searchParams: {},
        state: null,
      },
      navigateService: scope.get(NavigateServiceInterface),
      session: new SessionRuntimeState(),
    });

    activation.complete();
    await preloading;

    expect(load).not.toHaveBeenCalled();
  });
});

const createFrameRouter = (baseSource: string): FrameRouter => {
  return new FrameRouter({
    baseSource,
    routes: [new FrameRoute({ load: async () => ({}) })],
  });
};

const createRouteRuntimeHandle = (scope: RuntimeScope = new ApplicationScope()): RouteRuntimeHandle => ({
  commit: vi.fn(),
  discardPending: vi.fn(),
  dispose: vi.fn(async () => {}),
  getRouteScope: () => scope,
});

const createScope = (runtime: RouterRuntime): ApplicationScope => {
  const scope = new ApplicationScope();

  scope.bindRouterRuntime(runtime);
  scope.activate(TestRouterOwner);

  return scope;
};

class TestRouterBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new RouterServiceBindings().register(registry);
  }
}

@UseBindings(TestRouterBindings)
class TestRouterOwner {}
