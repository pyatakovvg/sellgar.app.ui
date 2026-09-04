import { describe, expect, it, vi } from 'vitest';

import { param, segments } from '../../declaration/address';
import { getRouteDefinition, Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import type { NavigationState } from '../../runtime/navigation-state';
import { createNavigationRequest } from '../navigation-request';
import { executeNavigateRequest, resolveNavigateRequest } from './navigate.service.ts';
import { createCoreNavigate, createScopedNavigate } from './navigate.service.ts';

class OneRoute {
  declare readonly id: string;
}

class TwiseRoute {
  declare readonly id: string;
}

class InspectorRoute {
  declare readonly id: string;
}

const createRouter = (): Router => {
  const inspectorRouter = new Router({
    routes: [
      new Route({
        address: segments('inspect', param('id')),
        load: async () => ({}),
        token: InspectorRoute,
      }),
    ],
  });

  return new Router({
    routes: [
      new Route({
        address: segments('ones', param('id')),
        routes: [
          new Route({
            address: segments('twise', param('id')),
            load: async () => ({}),
            token: TwiseRoute,
          }),
        ],
        routing: [inspectorRouter],
        token: OneRoute,
      }),
    ],
  });
};

const createNavigationHarness = () => {
  let current: NavigationState | undefined;
  const execute = vi.fn((navigation: NavigationState) => {
    current = navigation;
  });
  const navigate = createCoreNavigate({
    back: vi.fn(),
    close: execute,
    current: () => current,
    execute,
    router: createRouter(),
  });

  return {
    execute,
    getCurrent: () => current,
    navigate,
  };
};

const openActiveOwnerBranch = async (harness: ReturnType<typeof createNavigationHarness>): Promise<void> => {
  await harness.navigate
    .through(OneRoute, { params: { id: 'one-next' } })
    .to(TwiseRoute, { params: { id: 'twise-2' } });
  harness.execute.mockClear();
};

describe('CoreNavigate', () => {
  it('resolves and executes the same ordered request used by declarative navigation controls', async () => {
    const harness = createNavigationHarness();
    const request = createNavigationRequest((navigate) =>
      navigate.through(OneRoute, { params: { id: 'one-1' } }).to(TwiseRoute, { params: { id: 'twise-2' } }),
    );
    const resolved = resolveNavigateRequest(harness.navigate, request);

    expect(harness.execute).not.toHaveBeenCalled();
    expect(resolved.root.path.map(({ params, token }) => ({ params, token }))).toEqual([
      { params: { id: 'one-1' }, token: OneRoute },
      { params: { id: 'twise-2' }, token: TwiseRoute },
    ]);

    await executeNavigateRequest(harness.navigate, request);

    expect(harness.execute).toHaveBeenCalledOnce();
    expect(harness.getCurrent()).toEqual(resolved);
  });

  it('treats matching through params of an active nested Router owner as context only', async () => {
    const harness = createNavigationHarness();

    await openActiveOwnerBranch(harness);
    await harness.navigate
      .through(OneRoute, { params: { id: 'one-next' } })
      .to(InspectorRoute, { params: { id: 'inspect-3' } });

    expect(harness.execute).toHaveBeenCalledOnce();
    expect(harness.getCurrent()?.root.path.map(({ params, token }) => ({ params, token }))).toEqual([
      { params: { id: 'one-next' }, token: OneRoute },
      { params: { id: 'twise-2' }, token: TwiseRoute },
    ]);
    expect(harness.getCurrent()?.root.child?.path[0]).toMatchObject({
      params: { id: 'inspect-3' },
      token: InspectorRoute,
    });
  });

  it('rejects through params that attempt to mutate an active nested Router owner', async () => {
    const harness = createNavigationHarness();

    await openActiveOwnerBranch(harness);

    await expect(
      harness.navigate
        .through(OneRoute, { params: { id: 'one-1' } })
        .to(InspectorRoute, { params: { id: 'inspect-3' } }),
    ).rejects.toThrow('navigate.through() не может изменять params активного владельца nested Router: OneRoute.');
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.getCurrent()?.root.child).toBeNull();
  });

  it('reuses the committed owner branch when navigating directly to a nested Router target', async () => {
    const harness = createNavigationHarness();

    await openActiveOwnerBranch(harness);
    await harness.navigate.to(InspectorRoute, { params: { id: 'inspect-3' } });

    expect(harness.getCurrent()?.root.path.map(({ params, token }) => ({ params, token }))).toEqual([
      { params: { id: 'one-next' }, token: OneRoute },
      { params: { id: 'twise-2' }, token: TwiseRoute },
    ]);
  });

  it('uses through params to activate ancestry that is not committed yet', async () => {
    const harness = createNavigationHarness();

    await harness.navigate
      .through(OneRoute, { params: { id: 'one-1' } })
      .to(InspectorRoute, { params: { id: 'inspect-3' } });

    expect(harness.getCurrent()?.root.path[0]).toMatchObject({
      params: { id: 'one-1' },
      token: OneRoute,
    });
    expect(harness.getCurrent()?.root.child?.path[0]).toMatchObject({
      params: { id: 'inspect-3' },
      token: InspectorRoute,
    });
  });

  it('closes only the active nested Router and preserves its owner branch', async () => {
    const harness = createNavigationHarness();

    await openActiveOwnerBranch(harness);
    await harness.navigate.to(InspectorRoute, {
      params: { id: 'inspect-3' },
      query: { tab: 'history' },
    });

    const ownerRoute = harness.getCurrent()!.root.path[0]!.route;
    const nestedRouter = getRouteDefinition(ownerRoute).routing[0]!;
    const nestedNavigate = createScopedNavigate(harness.navigate, nestedRouter);

    await nestedNavigate.close();

    expect(harness.getCurrent()?.root.path.map(({ params, token }) => ({ params, token }))).toEqual([
      { params: { id: 'one-next' }, token: OneRoute },
      { params: { id: 'twise-2' }, token: TwiseRoute },
    ]);
    expect(harness.getCurrent()?.root.child).toBeNull();
    expect(harness.getCurrent()?.root.query).toEqual({});
  });

  it('updates only the query owned by the scoped Router and ignores an equivalent update', async () => {
    const harness = createNavigationHarness();
    await openActiveOwnerBranch(harness);
    await harness.navigate.query({ page: 2 });
    await harness.navigate.to(InspectorRoute, { params: { id: 'inspect-3' }, query: { tab: 'history' } });

    const nestedRouter = harness.getCurrent()!.root.child!.router;
    const nestedNavigate = createScopedNavigate(harness.navigate, nestedRouter);
    harness.execute.mockClear();
    await nestedNavigate.query({ tab: 'details', values: ['one', 'two'] });

    expect(harness.getCurrent()?.root.query).toEqual({ page: 2 });
    expect(harness.getCurrent()?.root.child?.query).toEqual({ tab: 'details', values: ['one', 'two'] });
    expect(harness.getCurrent()?.revalidation).toEqual({ kind: 'router', router: nestedRouter });

    harness.execute.mockClear();
    await nestedNavigate.query({ tab: 'details', values: ['one', 'two'] });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('rejects close outside of a nested Router scope', async () => {
    const harness = createNavigationHarness();

    await openActiveOwnerBranch(harness);

    await expect(harness.navigate.close()).rejects.toThrow(
      'navigate.close() доступен только внутри вложенного Router scope.',
    );
  });
});
