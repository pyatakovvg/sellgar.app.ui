import { describe, expect, it, vi } from 'vitest';

import type { FrameRouter } from '../../../../../../frame/router/declaration';
import { NavigationBlockerRuntime } from '../navigation-blocker-runtime.ts';

describe('NavigationBlockerRuntime', () => {
  it('blocks only when the owning route instance is left', () => {
    const runtime = new NavigationBlockerRuntime();

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);

    expect(
      runtime.shouldBlock({
        current: location([{ id: 'employees', pathname: '/employees' }]),
        next: location([{ id: 'employees', pathname: '/employees' }]),
      }),
    ).toBe(false);
    expect(
      runtime.shouldBlock({
        current: location([{ id: 'employees', pathname: '/employees/1' }]),
        next: location([{ id: 'employees', pathname: '/employees/2' }]),
      }),
    ).toBe(true);
    expect(
      runtime.shouldBlock({
        current: location([{ id: 'employees', pathname: '/employees' }]),
        next: location([{ id: 'terminals', pathname: '/terminals' }]),
      }),
    ).toBe(true);
  });

  it('does not block opening a frame over its owning route', () => {
    const runtime = new NavigationBlockerRuntime();
    const router = {} as FrameRouter;

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);

    expect(
      runtime.shouldBlock({
        current: location([{ id: 'employees', pathname: '/employees' }]),
        next: location([{ id: 'employees', pathname: '/employees' }], frame('employees', router, 'employees/42')),
      }),
    ).toBe(false);
  });

  it('combines boundary conditions and removes disposed registrations', () => {
    const runtime = new NavigationBlockerRuntime();
    const boundary = { kind: 'route', routeId: 'employees' } as const;
    const transition = {
      current: location([{ id: 'employees', pathname: '/employees' }]),
      next: location([{ id: 'terminals', pathname: '/terminals' }]),
    };

    runtime.register(boundary, () => false);
    const activeRegistration = runtime.register(boundary, () => true);

    expect(runtime.shouldBlock(transition)).toBe(true);
    expect(runtime.shouldBlockUnload()).toBe(true);

    activeRegistration.dispose();

    expect(runtime.shouldBlock(transition)).toBe(false);
    expect(runtime.shouldBlockUnload()).toBe(false);
  });

  it('blocks closing or replacing the owning frame route', () => {
    const runtime = new NavigationBlockerRuntime();
    const router = {} as FrameRouter;
    const boundary = { kind: 'frame', routeId: 'employees', router, sourcePath: 'employees/42/edit' } as const;

    runtime.register(boundary, () => true);

    expect(
      runtime.shouldBlock({
        current: location([], frame('employees', router, 'employees/42/edit')),
        next: location([], frame('employees', router, 'employees/42/edit')),
      }),
    ).toBe(false);
    expect(
      runtime.shouldBlock({
        current: location([], frame('employees', router, 'employees/42/edit')),
        next: location([], frame('employees', router, 'employees/42')),
      }),
    ).toBe(true);
    expect(
      runtime.shouldBlock({
        current: location([], frame('employees', router, 'employees/42/edit')),
        next: location(),
      }),
    ).toBe(true);
  });

  it('allows one transition for the requesting boundary without bypassing other owners', async () => {
    const runtime = new NavigationBlockerRuntime();
    const router = {} as FrameRouter;
    const routeBoundary = { kind: 'route', routeId: 'employees' } as const;
    const frameBoundary = { kind: 'frame', routeId: 'employees', router, sourcePath: 'employees/42/edit' } as const;
    const transition = {
      current: location([{ id: 'employees', pathname: '/employees' }], frame('employees', router, 'employees/42/edit')),
      next: location([{ id: 'terminals', pathname: '/terminals' }]),
    };

    runtime.register(routeBoundary, () => true);
    runtime.register(frameBoundary, () => true);

    await runtime.allow(frameBoundary, async () => {
      expect(runtime.shouldBlock(transition)).toBe(true);
    });

    await runtime.allow(routeBoundary, async () => {
      await runtime.allow(frameBoundary, async () => {
        expect(runtime.shouldBlock(transition)).toBe(false);
      });
    });

    expect(runtime.shouldBlock(transition)).toBe(true);
  });

  it('does not share an allowance between independent frame routers with the same source', async () => {
    const runtime = new NavigationBlockerRuntime();
    const leftRouter = {} as FrameRouter;
    const rightRouter = {} as FrameRouter;
    const leftBoundary = { kind: 'frame', routeId: 'employees', router: leftRouter, sourcePath: 'review' } as const;
    const rightBoundary = { kind: 'frame', routeId: 'employees', router: rightRouter, sourcePath: 'review' } as const;

    runtime.register(leftBoundary, () => true);
    runtime.register(rightBoundary, () => true);

    await runtime.allow(leftBoundary, async () => {
      expect(
        runtime.shouldBlock({
          current: location([], frame('employees', rightRouter, 'review')),
          next: location(),
        }),
      ).toBe(true);
    });
  });

  it('controls the pending router transition through leave and stay', () => {
    const runtime = new NavigationBlockerRuntime();
    const proceed = vi.fn();
    const reset = vi.fn();

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);
    runtime.shouldBlock({
      current: location([{ id: 'employees', pathname: '/employees' }]),
      next: location([{ id: 'terminals', pathname: '/terminals' }]),
    });
    runtime.attach({ proceed, reset });

    runtime.stay();

    expect(reset).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toBeNull();

    runtime.shouldBlock({
      current: location([{ id: 'employees', pathname: '/employees' }]),
      next: location([{ id: 'terminals', pathname: '/terminals' }]),
    });
    runtime.attach({ proceed, reset });
    runtime.leave();

    expect(proceed).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot()).toEqual(expect.objectContaining({ inProcess: true }));

    runtime.stay();

    expect(reset).toHaveBeenCalledOnce();

    runtime.complete();

    expect(runtime.getSnapshot()).toBeNull();
  });
});

interface RouteMatch {
  readonly id: string;
  readonly pathname: string;
}

const location = (routes: readonly RouteMatch[] = [], activeFrame = null) => ({
  frame: activeFrame,
  routes,
});

const frame = (routeId: string, router: FrameRouter, sourcePath: string) => ({
  routeId,
  router,
  sourcePath,
});
