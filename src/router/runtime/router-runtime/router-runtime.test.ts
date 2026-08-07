import { describe, expect, it, vi } from 'vitest';

import { Frame, FrameDefinition } from '../../../frame/declaration/frame';
import { HashFrameSource } from '../../../frame/source/hash-frame-source';
import { ApplicationScope } from '../../../runtime/scope/kind';
import type { RuntimeScope } from '../../../runtime/scope/base';
import type { RouterParamsConstructor, RouterParamsConverterInterface } from '../../params/router-params-converter';
import type { NavigateServiceInterface } from '../../service/navigate-service';
import type { RouterLocationSnapshot } from '../../service/location-service';
import { parseHashToObject } from '../../utils/hash-utils';

import { RouterRuntime, type RouteRuntimeHandle } from './';

describe('RouterRuntime', () => {
  it('commits newly active routes', () => {
    const routerRuntime = new RouterRuntime();
    const routeRuntime = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', routeRuntime);
    routerRuntime.syncActiveRoutes(['root.route:1']);

    expect(routeRuntime.commit).toHaveBeenCalledTimes(1);
    expect(routeRuntime.discardPending).not.toHaveBeenCalled();
    expect(routeRuntime.dispose).not.toHaveBeenCalled();
  });

  it('discards pending inactive routes that were not active before', () => {
    const routerRuntime = new RouterRuntime();
    const activeRoute = createRouteRuntimeHandle();
    const inactiveRoute = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', activeRoute);
    routerRuntime.register('root.route:2', inactiveRoute);
    routerRuntime.syncActiveRoutes(['root.route:1']);

    expect(inactiveRoute.discardPending).toHaveBeenCalledTimes(1);
    expect(inactiveRoute.dispose).not.toHaveBeenCalled();
  });

  it('disposes previously active routes that leave active matches', async () => {
    const routerRuntime = new RouterRuntime();
    const previousRoute = createRouteRuntimeHandle();
    const nextRoute = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', previousRoute);
    routerRuntime.register('root.route:2', nextRoute);
    routerRuntime.syncActiveRoutes(['root.route:1']);
    routerRuntime.syncActiveRoutes(['root.route:2']);

    await waitForMicrotask();

    expect(nextRoute.commit).toHaveBeenCalledTimes(1);
    expect(previousRoute.discardPending).toHaveBeenCalledTimes(1);
    expect(previousRoute.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps active routes active across repeated sync', async () => {
    const routerRuntime = new RouterRuntime();
    const routeRuntime = createRouteRuntimeHandle();
    const listener = vi.fn();

    routerRuntime.subscribe(listener);
    routerRuntime.register('root.route:1', routeRuntime);
    routerRuntime.syncActiveRoutes(['root.route:1']);
    routerRuntime.syncActiveRoutes(['root.route:1']);

    await waitForMicrotask();

    expect(routeRuntime.commit).toHaveBeenCalledTimes(2);
    expect(routeRuntime.discardPending).not.toHaveBeenCalled();
    expect(routeRuntime.dispose).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('ignores unregistered active route ids from react router root matches', () => {
    const routerRuntime = new RouterRuntime();
    const routeRuntime = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', routeRuntime, {
      frames: [ParentFrame],
    });
    routerRuntime.syncActiveRoutes(['0', 'root.route:1']);

    expect(routeRuntime.commit).toHaveBeenCalledTimes(1);
    expect(routerRuntime.getActiveFrames()).toEqual([ParentFrame]);
  });

  it('disposes every registered route on router dispose', async () => {
    const routerRuntime = new RouterRuntime();
    const firstRoute = createRouteRuntimeHandle();
    const secondRoute = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', firstRoute);
    routerRuntime.register('root.route:2', secondRoute);

    await routerRuntime.dispose();

    expect(firstRoute.dispose).toHaveBeenCalledTimes(1);
    expect(secondRoute.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not dispose a route twice after router dispose resets active state', async () => {
    const routerRuntime = new RouterRuntime();
    const routeRuntime = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', routeRuntime);
    routerRuntime.syncActiveRoutes(['root.route:1']);

    await routerRuntime.dispose();
    routerRuntime.syncActiveRoutes([]);
    await waitForMicrotask();

    expect(routeRuntime.dispose).toHaveBeenCalledTimes(1);
  });

  it('returns active frames from active route branch in route order', () => {
    const routerRuntime = new RouterRuntime();
    const parentRoute = createRouteRuntimeHandle();
    const childRoute = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', parentRoute, {
      frames: [ParentFrame],
    });
    routerRuntime.register('root.route:1.route:2', childRoute, {
      frames: [ParentFrame, ChildFrame],
    });

    routerRuntime.syncActiveRoutes(['root.route:1', 'root.route:1.route:2']);

    expect(routerRuntime.getActiveFrames()).toEqual([ParentFrame, ChildFrame]);
  });

  it('checks whether frame is available on active route branch', () => {
    const routerRuntime = new RouterRuntime();

    routerRuntime.register('root.route:1', createRouteRuntimeHandle(), {
      frames: [ParentFrame],
    });
    routerRuntime.register('root.route:1.route:2', createRouteRuntimeHandle(), {
      frames: [ParentFrame, ChildFrame],
    });
    routerRuntime.syncActiveRoutes(['root.route:1']);

    expect(routerRuntime.hasActiveFrame(ParentFrame)).toBe(true);
    expect(routerRuntime.hasActiveFrame(ChildFrame)).toBe(false);

    routerRuntime.syncActiveRoutes(['root.route:1', 'root.route:1.route:2']);

    expect(routerRuntime.hasActiveFrame(ChildFrame)).toBe(true);
  });

  it('clears active frames on router dispose', async () => {
    const routerRuntime = new RouterRuntime();

    routerRuntime.register('root.route:1', createRouteRuntimeHandle(), {
      frames: [ParentFrame],
    });
    routerRuntime.syncActiveRoutes(['root.route:1']);

    await routerRuntime.dispose();

    expect(routerRuntime.getActiveFrames()).toEqual([]);
  });

  it('invalidates active route frames without disposing route runtimes before the next committed sync', async () => {
    const routerRuntime = new RouterRuntime();
    const routeRuntime = createRouteRuntimeHandle();
    const listener = vi.fn();

    routerRuntime.register('root.route:1', routeRuntime, {
      frames: [ParentFrame],
    });
    routerRuntime.syncActiveRoutes(['root.route:1']);
    routerRuntime.subscribe(listener);

    routerRuntime.invalidateActiveRoutes();
    await waitForMicrotask();

    expect(routerRuntime.getActiveFrames()).toEqual([]);
    expect(routeRuntime.discardPending).not.toHaveBeenCalled();
    expect(routeRuntime.dispose).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
    expect(routerRuntime.get('root.route:1')).toBe(routeRuntime);
  });

  it('disposes invalidated active routes on the next committed route sync', async () => {
    const routerRuntime = new RouterRuntime();
    const invalidatedRoute = createRouteRuntimeHandle();
    const nextRoute = createRouteRuntimeHandle();

    routerRuntime.register('root.route:1', invalidatedRoute, {
      frames: [ParentFrame],
    });
    routerRuntime.register('root.route:2', nextRoute);
    routerRuntime.syncActiveRoutes(['root.route:1']);
    routerRuntime.invalidateActiveRoutes();
    routerRuntime.syncActiveRoutes(['root.route:2']);

    await waitForMicrotask();

    expect(nextRoute.commit).toHaveBeenCalledTimes(1);
    expect(invalidatedRoute.discardPending).toHaveBeenCalledTimes(1);
    expect(invalidatedRoute.dispose).toHaveBeenCalledTimes(1);
  });

  it('resolves active frames through frame sources', () => {
    const routerRuntime = new RouterRuntime();
    const parentScope = new ApplicationScope();
    const childScope = new ApplicationScope();

    routerRuntime.register('root.route:1', createRouteRuntimeHandle(parentScope), {
      frames: [ParentFrame],
    });
    routerRuntime.register('root.route:1.route:2', createRouteRuntimeHandle(childScope), {
      frames: [ParentFrame, ChildFrame],
    });
    routerRuntime.syncActiveRoutes(['root.route:1', 'root.route:1.route:2']);

    expect(
      routerRuntime.resolveActiveFrames({
        location: createLocation("#parent&child(id='123')"),
        navigateService: createNavigateService(),
        paramsConverter: createRouterParamsConverter(),
      }),
    ).toEqual([
      {
        back: expect.any(Function),
        close: expect.any(Function),
        exception: undefined,
        frame: ChildFrame,
        ownerScope: childScope,
        preparedRuntime: null,
        props: {
          id: '123',
        },
        runtimeKey: 'child:{"id":"123"}',
      },
    ]);
  });

  it('skips available frames with inactive sources', () => {
    const routerRuntime = new RouterRuntime();

    routerRuntime.register('root.route:1', createRouteRuntimeHandle(), {
      frames: [ParentFrame, ChildFrame],
    });
    routerRuntime.syncActiveRoutes(['root.route:1']);

    expect(
      routerRuntime.resolveActiveFrames({
        location: createLocation('#parent'),
        navigateService: createNavigateService(),
        paramsConverter: createRouterParamsConverter(),
      }),
    ).toEqual([
      {
        back: expect.any(Function),
        close: expect.any(Function),
        exception: undefined,
        frame: ParentFrame,
        ownerScope: expect.any(ApplicationScope),
        preparedRuntime: null,
        props: {},
        runtimeKey: 'parent:"null"',
      },
    ]);
  });

  it('resolves active frame exception from nearest active route', () => {
    const routerRuntime = new RouterRuntime();
    const parentException = 'Parent exception';
    const childException = 'Child exception';

    routerRuntime.register('root.route:1', createRouteRuntimeHandle(), {
      exception: parentException,
      frames: [ParentFrame],
    });
    routerRuntime.register('root.route:1.route:2', createRouteRuntimeHandle(), {
      frames: [ParentFrame],
      resolveException: () => childException,
    });
    routerRuntime.syncActiveRoutes(['root.route:1', 'root.route:1.route:2']);

    expect(
      routerRuntime.resolveActiveFrames({
        location: createLocation('#parent'),
        navigateService: createNavigateService(),
        paramsConverter: createRouterParamsConverter(),
      }),
    ).toEqual([
      {
        back: expect.any(Function),
        close: expect.any(Function),
        exception: childException,
        frame: ParentFrame,
        ownerScope: expect.any(ApplicationScope),
        preparedRuntime: null,
        props: {},
        runtimeKey: 'parent:"null"',
      },
    ]);
  });

});

const createRouteRuntimeHandle = (scope: RuntimeScope = new ApplicationScope()): RouteRuntimeHandle => {
  return {
    commit: vi.fn(),
    discardPending: vi.fn(),
    dispose: vi.fn(async () => {}),
    getPreparedFrameRuntime: vi.fn(() => null),
    prepareFrameRuntime: vi.fn((): never => {
      throw new Error('Неожиданная подготовка runtime фрейма.');
    }),
    getRuntimeScope: () => scope,
  };
};

const waitForMicrotask = async (): Promise<void> => {
  await Promise.resolve();
};

const ParentFrameView = (): null => {
  return null;
};

const ChildFrameView = (): null => {
  return null;
};

@Frame({
  source: HashFrameSource.create('parent'),
  view: ParentFrameView,
})
class ParentFrame extends FrameDefinition {}

@Frame({
  source: HashFrameSource.create('child'),
  view: ChildFrameView,
})
class ChildFrame extends FrameDefinition {}

const createLocation = (hash: string): RouterLocationSnapshot => {
  return {
    hash,
    hashParams: parseHashToObject(hash),
    key: 'test',
    params: {},
    pathname: '/',
    search: '',
    searchParams: {},
    state: null,
  };
};

const createRouterParamsConverter = (): RouterParamsConverterInterface => {
  return {
    toObject: <TValue extends object>(_target: RouterParamsConstructor<TValue>, params: Record<string, unknown>) => {
      return params as TValue;
    },
  };
};

const createNavigateService = (): NavigateServiceInterface => {
  return {
    back: vi.fn(async () => {}),
    hashParams: vi.fn(async () => {}),
    replace: vi.fn(async () => {}),
    searchParams: vi.fn(async () => {}),
    to: vi.fn(async () => {}),
  };
};
