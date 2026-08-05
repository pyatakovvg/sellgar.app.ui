import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Location, UIMatch } from 'react-router-dom';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { RouterRuntime } from '../../../router/runtime/router-runtime';
import { RouterService } from '../../../router/service/router-service';
import { ClassTransformerRouterParamsConverter } from '../../../router/params/class-transformer-router-params-converter';

import { ActiveRouteRuntimeBoundary, RouterServiceLocationBoundary, SessionRevalidationBoundary } from './index.ts';

const useMatchesMock = vi.hoisted(() => {
  return vi.fn<() => UIMatch[]>();
});
const useLocationMock = vi.hoisted(() => {
  return vi.fn<() => Location>();
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

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

  it('revalidates active routes when session becomes anonymous', async () => {
    const session = new SessionRuntimeState();
    const routerRuntime = new RouterRuntime();
    const invalidateActiveRoutes = vi.spyOn(routerRuntime, 'invalidateActiveRoutes');
    const revalidate = vi.fn();

    session.setAuthenticated();

    render(
      <SessionRevalidationBoundary revalidate={revalidate} routerRuntime={routerRuntime} session={session}>
        <div>Route content</div>
      </SessionRevalidationBoundary>,
    );

    session.setAnonymous();
    session.setAuthenticated();

    await waitFor(() => {
      expect(invalidateActiveRoutes).toHaveBeenCalledOnce();
      expect(revalidate).toHaveBeenCalledOnce();
    });
  });
});

const createMatch = (id: string, params: UIMatch['params'] = {}): UIMatch => {
  return {
    id,
    data: void 0,
    handle: void 0,
    loaderData: void 0,
    params,
    pathname: '/',
  };
};
