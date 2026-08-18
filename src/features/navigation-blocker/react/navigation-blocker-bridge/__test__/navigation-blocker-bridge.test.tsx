import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RouterRuntime } from '../../../../../router/runtime/router-runtime';
import { NavigationBlockerRuntime } from '../../../runtime/navigation-blocker-runtime';
import { NavigationBlockerBridge } from '../navigation-blocker-bridge.tsx';

describe('NavigationBlockerBridge', () => {
  afterEach(() => {
    restoreNavigationApi();
  });

  it('keeps a React Router transition pending until it is reset or proceeded', async () => {
    const runtime = new NavigationBlockerRuntime();
    const routerRuntime = new RouterRuntime();
    const routeObjects: RouteObject[] = [
      { element: <div>Employees</div>, id: 'employees', path: '/employees' },
      { element: <div>Terminals</div>, id: 'terminals', path: '/terminals' },
    ];
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <NavigationBlockerBridge routeObjects={routeObjects} routerRuntime={routerRuntime} runtime={runtime} />
              <Outlet />
            </>
          ),
          path: '/',
          children: routeObjects,
        },
      ],
      { initialEntries: ['/employees'] },
    );

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);
    render(<RouterProvider router={router} />);

    await act(() => router.navigate('/terminals'));

    await waitFor(() => {
      expect(runtime.getSnapshot()).toEqual({ inProcess: false, presentation: undefined });
    });
    expect(router.state.location.pathname).toBe('/employees');

    act(() => runtime.stay());

    expect(router.state.location.pathname).toBe('/employees');
    expect(runtime.getSnapshot()).toBeNull();

    await act(() => router.navigate('/terminals'));
    await waitFor(() => expect(runtime.getSnapshot()).not.toBeNull());
    act(() => runtime.leave());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/terminals');
      expect(runtime.getSnapshot()).toBeNull();
    });
  });

  it('cancels browser unload when an active condition is true', () => {
    const runtime = new NavigationBlockerRuntime();
    const routeObjects: RouteObject[] = [{ element: <div>Employees</div>, id: 'employees', path: '/employees' }];
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <NavigationBlockerBridge
                routeObjects={routeObjects}
                routerRuntime={new RouterRuntime()}
                runtime={runtime}
              />
              <Outlet />
            </>
          ),
          path: '/',
          children: routeObjects,
        },
      ],
      { initialEntries: ['/employees'] },
    );

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);
    render(<RouterProvider router={router} />);

    const event = new Event('beforeunload', { cancelable: true });

    expect(window.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps a supported traversal before URL commit and permits its React Router POP after confirmation', async () => {
    const navigation = installNavigationApi();
    const { router, runtime } = createTestRouter({
      basePath: '/terminals-management',
      initialEntries: ['/terminals', '/employees'],
      initialIndex: 1,
    });

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);
    render(<RouterProvider router={router} />);

    const event = createTraverseEvent('http://localhost/terminals-management/terminals');
    navigation.dispatchEvent(event);

    const intercept = vi.mocked(event.intercept);

    expect(intercept).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe('/employees');
    expect(runtime.getSnapshot()).toEqual({ inProcess: false, presentation: undefined });

    const options = intercept.mock.calls[0]?.[0];
    const precommit = options?.precommitHandler?.({} as NavigationPrecommitController);

    act(() => runtime.leave());
    await expect(precommit).resolves.toBeUndefined();

    await act(() => router.navigate(-1));
    await options?.handler?.();

    expect(router.state.location.pathname).toBe('/terminals');
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('cancels a supported traversal without changing the current URL', async () => {
    const navigation = installNavigationApi();
    const { router, runtime } = createTestRouter({
      initialEntries: ['/terminals', '/employees'],
      initialIndex: 1,
    });

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);
    render(<RouterProvider router={router} />);

    const event = createTraverseEvent('http://localhost/terminals');
    navigation.dispatchEvent(event);

    const options = vi.mocked(event.intercept).mock.calls[0]?.[0];
    const precommit = options?.precommitHandler?.({} as NavigationPrecommitController);

    act(() => runtime.stay());

    await expect(precommit).rejects.toMatchObject({ name: 'AbortError' });
    expect(router.state.location.pathname).toBe('/employees');
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('falls back to the React Router blocker when a traversal was not intercepted', async () => {
    const navigation = installNavigationApi();
    const { router, runtime } = createTestRouter({
      initialEntries: ['/terminals', '/employees'],
      initialIndex: 1,
    });

    runtime.register({ kind: 'route', routeId: 'employees' }, () => true);
    render(<RouterProvider router={router} />);

    const event = createTraverseEvent('http://localhost/terminals', false);

    navigation.dispatchEvent(event);
    expect(event.intercept).not.toHaveBeenCalled();

    await act(() => router.navigate(-1));

    await waitFor(() => expect(runtime.getSnapshot()).not.toBeNull());
    expect(router.state.location.pathname).toBe('/employees');
  });

  it('does not evaluate an allowed traversal a second time in the React Router blocker', async () => {
    const navigation = installNavigationApi();
    const { router, runtime } = createTestRouter({
      initialEntries: ['/terminals', '/employees'],
      initialIndex: 1,
    });
    const boundary = { kind: 'route', routeId: 'employees' } as const;

    runtime.register(boundary, () => true);
    render(<RouterProvider router={router} />);

    await runtime.allow(boundary, async () => {
      const event = createTraverseEvent('http://localhost/terminals');

      navigation.dispatchEvent(event);
      expect(event.intercept).not.toHaveBeenCalled();

      await act(() => router.navigate(-1));
    });

    expect(router.state.location.pathname).toBe('/terminals');
    expect(runtime.getSnapshot()).toBeNull();
  });
});

interface TestRouterOptions {
  readonly basePath?: string;
  readonly initialEntries: string[];
  readonly initialIndex: number;
}

const createTestRouter = (options: TestRouterOptions) => {
  const runtime = new NavigationBlockerRuntime();
  const routerRuntime = new RouterRuntime();
  const routeObjects: RouteObject[] = [
    { element: <div>Employees</div>, id: 'employees', path: '/employees' },
    { element: <div>Terminals</div>, id: 'terminals', path: '/terminals' },
  ];
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <NavigationBlockerBridge
              basePath={options.basePath}
              routeObjects={routeObjects}
              routerRuntime={routerRuntime}
              runtime={runtime}
            />
            <Outlet />
          </>
        ),
        path: '/',
        children: routeObjects,
      },
    ],
    {
      initialEntries: options.initialEntries,
      initialIndex: options.initialIndex,
    },
  );

  return { router, runtime };
};

const originalNavigationDescriptor = Object.getOwnPropertyDescriptor(window, 'navigation');
const originalPrecommitControllerDescriptor = Object.getOwnPropertyDescriptor(window, 'NavigationPrecommitController');

const installNavigationApi = (): EventTarget => {
  const navigation = new EventTarget();

  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: navigation,
  });
  Object.defineProperty(window, 'NavigationPrecommitController', {
    configurable: true,
    value: class NavigationPrecommitController {},
  });

  return navigation;
};

const restoreNavigationApi = (): void => {
  restoreWindowProperty('navigation', originalNavigationDescriptor);
  restoreWindowProperty('NavigationPrecommitController', originalPrecommitControllerDescriptor);
};

const restoreWindowProperty = (property: string, descriptor?: PropertyDescriptor): void => {
  if (descriptor) {
    Object.defineProperty(window, property, descriptor);
    return;
  }

  Reflect.deleteProperty(window, property);
};

const createTraverseEvent = (url: string, canIntercept = true): NavigateEvent => {
  const event = new Event('navigate', { cancelable: true }) as NavigateEvent;

  Object.defineProperties(event, {
    canIntercept: { value: canIntercept },
    destination: {
      value: {
        sameDocument: true,
        url,
      },
    },
    intercept: { value: vi.fn() },
    navigationType: { value: 'traverse' },
    signal: { value: new AbortController().signal },
  });

  return event;
};
