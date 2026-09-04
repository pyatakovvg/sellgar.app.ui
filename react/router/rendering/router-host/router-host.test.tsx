import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { RouterHost } from './router-host.tsx';

class TestRoute {}
class TestChildRoute {}

describe('RouterHost', () => {
  it('attributes a Router layout error to RouterRuntime', async () => {
    const error = new Error('router layout failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failRender = vi.fn(async () => undefined);
    const BrokenLayoutView: React.FC<LayoutViewProps> = () => {
      throw error;
    };

    @Layout({ view: BrokenLayoutView })
    class BrokenLayout {}

    const router = new Router({
      layouts: [BrokenLayout],
      routes: [new Route({ load: async () => ({}), token: TestRoute })],
    });
    const branch = {
      child: null,
      childPending: false,
      pending: false,
      pendingLocalChange: null,
      routes: [],
    };
    const snapshot = { error: null, phase: 'active' as const };
    const runtime = {
      failRender,
      getBranchSnapshot: () => branch,
      getSnapshot: () => snapshot,
      router,
      subscribe: () => () => undefined,
    } as unknown as RouterRuntime<ModuleMetadata>;

    render(<RouterHost components={{ exception: <div>router exception</div> }} runtime={runtime} />);

    expect(screen.getByText('router exception')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(error));
    consoleError.mockRestore();
  });

  it('renders a pending branch change outside layouts that are being replaced', () => {
    const BranchLayoutView: React.FC<LayoutViewProps> = ({ children }) => (
      <div>
        <span>authenticated tabs</span>
        {children}
      </div>
    );

    @Layout({ view: BranchLayoutView })
    class BranchLayout {}

    const route = new Route({
      layouts: [BranchLayout],
      load: async () => ({}),
      token: TestRoute,
    });
    const runtime = createRouteRuntime(route);
    const router = new Router({ routes: [route] });
    const routerRuntime = createRouterRuntime(router, [runtime], 0);

    render(<RouterHost components={{ fallback: <div>loading next branch</div> }} runtime={routerRuntime} />);

    expect(screen.getByText('loading next branch')).toBeInTheDocument();
    expect(screen.queryByText('authenticated tabs')).not.toBeInTheDocument();
  });

  it('keeps layouts from the unchanged route prefix around a pending child', () => {
    const BranchLayoutView: React.FC<LayoutViewProps> = ({ children }) => (
      <div>
        <span>authenticated tabs</span>
        {children}
      </div>
    );

    @Layout({ view: BranchLayoutView })
    class BranchLayout {}

    const childRoute = new Route({ load: async () => ({}), token: TestChildRoute });
    const branchRoute = new Route({ layouts: [BranchLayout], routes: [childRoute] });
    const routes = [createRouteRuntime(branchRoute), createRouteRuntime(childRoute)];
    const router = new Router({ routes: [branchRoute] });
    const routerRuntime = createRouterRuntime(router, routes, 1);

    render(<RouterHost components={{ fallback: <div>loading next screen</div> }} runtime={routerRuntime} />);

    expect(screen.getByText('authenticated tabs')).toBeInTheDocument();
    expect(screen.getByText('loading next screen')).toBeInTheDocument();
  });
});

const createRouteRuntime = (route: Route): RouteActivationRuntime<ModuleMetadata> => {
  const scope = new ApplicationScope();
  const snapshot = Object.freeze({ error: null, phase: 'active' as const });

  return {
    failRender: async () => undefined,
    getRouteScope: () => scope,
    getSnapshot: () => snapshot,
    route,
    subscribe: () => () => undefined,
  } as unknown as RouteActivationRuntime<ModuleMetadata>;
};

const createRouterRuntime = (
  router: Router,
  routes: readonly RouteActivationRuntime<ModuleMetadata>[],
  commonRouteCount: number,
): RouterRuntime<ModuleMetadata> => {
  const branch = Object.freeze({
    child: null,
    childPending: false,
    pending: true,
    pendingLocalChange: Object.freeze({ commonRouteCount }),
    routes,
  });
  const snapshot = Object.freeze({ error: null, phase: 'pending' as const });

  return {
    failRender: async () => undefined,
    getBranchSnapshot: () => branch,
    getSnapshot: () => snapshot,
    router,
    subscribe: () => () => undefined,
  } as unknown as RouterRuntime<ModuleMetadata>;
};
