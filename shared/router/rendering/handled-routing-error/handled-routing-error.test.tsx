import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HttpException } from '../../../../core/http/exception/http-exception';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import type { RouteRuntimeSnapshot } from '../../../../core/router/runtime/route-runtime';
import { createHandledRoutingErrorPresentation } from './handled-routing-error';

const createRoute = (phase: RouteRuntimeSnapshot['phase']) => {
  const listeners = new Set<() => void>();
  let snapshot: RouteRuntimeSnapshot = { phase, exception: null };
  return {
    listeners,
    route: new Route({ load: async () => ({}) }),
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (phase: typeof snapshot.phase) => {
      snapshot = { phase, exception: null };
      listeners.forEach((listener) => listener());
    },
  };
};

const createRouter = (route: ReturnType<typeof createRoute>) => {
  const listeners = new Set<() => void>();
  const snapshot = { phase: 'active' as const, exception: null };
  let branch = { routes: [route], pendingLocalChange: null as { commonRouteCount: number } | null };
  return {
    listeners,
    router: new Router({ routes: [route.route] }),
    getSnapshot: () => snapshot,
    getBranchSnapshot: () => branch,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (routes: typeof branch.routes, commonRouteCount?: number) => {
      branch = { routes, pendingLocalChange: commonRouteCount === undefined ? null : { commonRouteCount } };
      listeners.forEach((listener) => listener());
    },
  };
};

const createPresentation = () => {
  const presentation = createHandledRoutingErrorPresentation({
    getRouteComponents: () => ({}),
    getRouterComponents: () => ({}),
  });
  const Probe = ({ status = 403 }: { status?: number }) => {
    const isHandled = presentation.useIsRoutingErrorHandled();
    return <output>{isHandled(new HttpException('request failed', status)) ? 'handled' : 'unhandled'}</output>;
  };
  return { ...presentation, Probe };
};

describe('handled routing error projection', () => {
  it('keeps a pending frame without a runtime independent from the parent outcome', () => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    render(
      <RoutingErrorPresentation runtime={createRouter(createRoute('forbidden'))} components={{ forbidden: <div /> }}>
        <RoutingErrorPresentation runtime={null} components={{}}>
          <Probe />
        </RoutingErrorPresentation>
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
  });
  it.each(['forbidden', 'not-found'] as const)('requires an existing %s presentation', (phase) => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    const route = createRoute(phase);
    const runtime = createRouter(route);
    render(
      <RoutingErrorPresentation runtime={runtime} components={{}}>
        <Probe status={phase === 'forbidden' ? 403 : 404} />
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
  });

  it.each([401, 404, 500])('does not consume an unrelated HTTP %s under Forbidden', (status) => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    render(
      <RoutingErrorPresentation runtime={createRouter(createRoute('forbidden'))} components={{ forbidden: <div /> }}>
        <Probe status={status} />
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
  });

  it('clears the handled outcome on recovery and releases all subscriptions', () => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    const route = createRoute('forbidden');
    const runtime = createRouter(route);
    const view = render(
      <RoutingErrorPresentation runtime={runtime} components={{ forbidden: <div /> }}>
        <Probe />
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^handled$/);
    act(() => route.publish('active'));
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
    view.unmount();
    expect(route.listeners.size).toBe(0);
    expect(runtime.listeners.size).toBe(0);
  });

  it('observes a replacement branch even when its handled outcome is unchanged', () => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    const first = createRoute('forbidden');
    const next = createRoute('forbidden');
    const runtime = createRouter(first);
    render(
      <RoutingErrorPresentation runtime={runtime} components={{ forbidden: <div /> }}>
        <Probe />
      </RoutingErrorPresentation>,
    );
    act(() => runtime.publish([next]));
    expect(first.listeners.size).toBe(0);
    expect(next.listeners.size).toBe(1);
    act(() => next.publish('active'));
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
  });

  it('does not inherit a handled outcome into an independent nested presentation', () => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    render(
      <RoutingErrorPresentation runtime={createRouter(createRoute('forbidden'))} components={{ forbidden: <div /> }}>
        <RoutingErrorPresentation runtime={createRouter(createRoute('active'))} components={{}}>
          <Probe />
        </RoutingErrorPresentation>
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
  });

  it('does not consume refusals from a replaced pending branch', () => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    const route = createRoute('forbidden');
    const runtime = createRouter(route);
    runtime.publish([route], 0);
    render(
      <RoutingErrorPresentation runtime={runtime} components={{ forbidden: <div /> }}>
        <Probe />
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('unhandled');
  });

  it('uses an explicit retained route projection instead of the current branch', () => {
    const { RoutingErrorPresentation, Probe } = createPresentation();
    const retained = createRoute('not-found');
    render(
      <RoutingErrorPresentation
        runtime={createRouter(createRoute('active'))}
        routes={[retained]}
        components={{ notFound: <div /> }}
      >
        <Probe status={404} />
      </RoutingErrorPresentation>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^handled$/);
  });
});
