import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RouterContextProvider,
  type LoaderFunctionArgs,
  type Location,
  type RouteObject,
  type UIMatch,
} from 'react-router';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RouterService } from '../../../router/service/router-service';
import { ClassTransformerRouterParamsConverter } from '../../../router/params/class-transformer-router-params-converter';
import { RuntimeOperationCoordinator } from '../../../runtime/operation';

import {
  ActiveRouteRuntimeBoundary,
  connectRuntimeRefresh,
  createFramePreloadLoader,
  RouterServiceLocationBoundary,
} from './index.ts';

const useMatchesMock = vi.hoisted(() => {
  return vi.fn<() => UIMatch[]>();
});
const useLocationMock = vi.hoisted(() => {
  return vi.fn<() => Location>();
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLocation: useLocationMock,
    useMatches: useMatchesMock,
  };
});

describe('React router adapter boundaries', () => {
  afterEach(() => {
    useLocationMock.mockReset();
    useMatchesMock.mockReset();
  });

  it('syncs route runtime with current React Router matches', async () => {
    const routerRuntime = new RouterRuntime();
    const syncActiveRoutes = vi.spyOn(routerRuntime, 'syncActiveRoutes');

    useMatchesMock.mockReturnValue([
      createMatch('root'),
      createMatch('root.route:1'),
      createMatch('root.route:1.route:2'),
    ]);

    render(
      <ActiveRouteRuntimeBoundary routerRuntime={routerRuntime}>
        <div>Route content</div>
      </ActiveRouteRuntimeBoundary>,
    );

    await waitFor(() => {
      expect(syncActiveRoutes).toHaveBeenCalledWith(['root', 'root.route:1', 'root.route:1.route:2']);
    });
  });

  it('resyncs route runtime when React Router matches change', async () => {
    const routerRuntime = new RouterRuntime();
    const syncActiveRoutes = vi.spyOn(routerRuntime, 'syncActiveRoutes');
    let matches: UIMatch[] = [createMatch('root'), createMatch('root.route:1')];

    useMatchesMock.mockImplementation(() => matches);

    const { rerender } = render(
      <ActiveRouteRuntimeBoundary routerRuntime={routerRuntime}>
        <div>Route content</div>
      </ActiveRouteRuntimeBoundary>,
    );

    matches = [createMatch('root'), createMatch('root.route:3')];

    rerender(
      <ActiveRouteRuntimeBoundary routerRuntime={routerRuntime}>
        <div>Next route content</div>
      </ActiveRouteRuntimeBoundary>,
    );

    await waitFor(() => {
      expect(syncActiveRoutes).toHaveBeenLastCalledWith(['root', 'root.route:3']);
    });
  });

  it('ignores empty matches without disposing router runtime directly', async () => {
    const routerRuntime = new RouterRuntime();
    const syncActiveRoutes = vi.spyOn(routerRuntime, 'syncActiveRoutes');
    const dispose = vi.spyOn(routerRuntime, 'dispose');

    useMatchesMock.mockReturnValue([]);

    const { unmount } = render(
      <ActiveRouteRuntimeBoundary routerRuntime={routerRuntime}>
        <div>Route content</div>
      </ActiveRouteRuntimeBoundary>,
    );

    expect(syncActiveRoutes).not.toHaveBeenCalled();

    unmount();

    expect(dispose).not.toHaveBeenCalled();
  });

  it('syncs router service location from current React Router location', async () => {
    const routerService = new RouterService(new ClassTransformerRouterParamsConverter());
    const syncLocation = vi.spyOn(routerService, 'syncLocation');

    useLocationMock.mockReturnValue({
      hash: '#details',
      key: 'location:1',
      pathname: '/reports',
      search: '?page=1',
      state: { source: 'test' },
    });
    useMatchesMock.mockReturnValue([createMatch('root', { reportId: '42' })]);

    render(
      <RouterServiceLocationBoundary routerService={routerService}>
        <div>Route content</div>
      </RouterServiceLocationBoundary>,
    );

    await waitFor(() => {
      expect(syncLocation).toHaveBeenCalledWith({
        hash: '#details',
        key: 'location:1',
        params: {
          reportId: '42',
        },
        pathname: '/reports',
        search: '?page=1',
        state: { source: 'test' },
      });
    });
  });

  it('подключает coordinator к единственному route refresh handler', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const routerRuntime = new RouterRuntime();
    const invalidateActiveRoutes = vi.spyOn(routerRuntime, 'invalidateActiveRoutes');
    const revalidate = vi.fn();

    session.setAuthenticated();

    connectRuntimeRefresh(coordinator, routerRuntime, revalidate);

    session.setAnonymous();
    session.setAuthenticated();

    await waitFor(() => {
      expect(invalidateActiveRoutes).toHaveBeenCalledOnce();
      expect(revalidate).toHaveBeenCalledOnce();
    });
  });

  it('схлопывает несколько session transitions внутри одной operation в одну route wave', async () => {
    const session = new SessionRuntimeState();
    const coordinator = new RuntimeOperationCoordinator(session);
    const routerRuntime = new RouterRuntime();
    const invalidateActiveRoutes = vi.spyOn(routerRuntime, 'invalidateActiveRoutes');
    const revalidate = vi.fn();

    connectRuntimeRefresh(coordinator, routerRuntime, revalidate);

    await coordinator.run(async () => {
      session.setAnonymous();
      session.setAuthenticated();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(invalidateActiveRoutes).toHaveBeenCalledOnce();
      expect(revalidate).toHaveBeenCalledOnce();
    });
  });

  it('preloads the frame for the destination route branch during router loading', async () => {
    const routerRuntime = new RouterRuntime();
    const preloadFrame = vi.spyOn(routerRuntime, 'preloadFrame').mockResolvedValue();
    const session = new SessionRuntimeState();
    const routeObjects: RouteObject[] = [
      {
        id: 'root.employees',
        path: 'employees',
        children: [{ id: 'root.employees.details', path: ':employeeId' }],
      },
    ];
    const loader = createFramePreloadLoader({
      app: {} as never,
      basePath: '/terminals-management',
      navigateService: {} as never,
      routeObjects,
      routerRuntime,
      session,
    });
    const url = new URL('https://example.test/terminals-management/employees/28#employees/28');
    const request = new Request(url);

    await loader({
      context: new RouterContextProvider(),
      params: {},
      pattern: '/',
      request,
      url,
    } satisfies LoaderFunctionArgs);

    expect(preloadFrame).toHaveBeenCalledWith(
      ['root.employees', 'root.employees.details'],
      '#employees/28',
      expect.objectContaining({
        location: expect.objectContaining({
          params: { employeeId: '28' },
          pathname: '/employees/28',
        }),
        session,
        signal: request.signal,
      }),
    );
  });
});

const createMatch = (id: string, params: UIMatch['params'] = {}): UIMatch => {
  return {
    id,
    handle: void 0,
    loaderData: void 0,
    params,
    pathname: '/',
  };
};
