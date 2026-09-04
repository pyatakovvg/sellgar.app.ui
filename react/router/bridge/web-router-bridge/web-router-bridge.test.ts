import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { param, segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import type { RouterBridgeInitializeContextInterface } from '../../../../core/router/bridge/router-bridge';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { createCoreNavigate } from '../../../../core/router/service/navigate-service';
import { createWebRouterBridge } from './web-router-bridge.ts';

class FirstRoute {}
class SecondRoute {}
class OneRoute {
  declare readonly id: string;
}
class InspectorRoute {
  declare readonly id: string;
}

const firstRoute = new Route({ address: segments('first'), load: async () => ({}), token: FirstRoute });
const secondRoute = new Route({ address: segments('second'), load: async () => ({}), token: SecondRoute });
const router = new Router({ routes: [firstRoute, secondRoute] });

describe('WebRouterBridge', () => {
  it('selects release mode for web ModuleRuntime lifecycle', () => {
    expect(createWebRouterBridge().runtimeRetention).toBe('release');
  });

  beforeEach(() => {
    window.history.replaceState(null, '', '/first');
  });

  afterEach(() => {
    restoreNavigationApi();
    window.history.replaceState(null, '', '/');
  });

  it('creates a shareable href from logical navigation state', () => {
    const bridge = createWebRouterBridge({ basePath: '/application' });
    const target = {
      ...navigation(secondRoute),
      root: { ...navigation(secondRoute).root, query: { filter: 'active', page: 2 } },
    };

    expect(bridge.createHref(target)).toBe('/application/second?filter=active&page=2');
  });

  it('keeps module and frame query independent around the hash question mark', async () => {
    window.history.replaceState(null, '', '/module?a=1&b=2#frame?a=4&b=8&c=9');
    const restore = vi.fn<RouterBridgeInitializeContextInterface['restore']>().mockResolvedValue(true);
    const bridge = createWebRouterBridge();

    await bridge.initialize({
      back: vi.fn().mockResolvedValue(false),
      cancelNavigation: vi.fn().mockReturnValue(false),
      confirm: vi.fn().mockResolvedValue(true),
      navigate: {} as NavigateServiceInterface,
      restore,
      router,
      shouldBlockUnload: () => false,
      signal: new AbortController().signal,
    });

    expect(restore).toHaveBeenCalledWith(
      {
        address: ['module'],
        nested: { address: ['frame'], query: { a: '4', b: '8', c: '9' } },
        query: { a: '1', b: '2' },
        revalidate: true,
        state: null,
      },
      { blockersConfirmed: false },
    );
  });

  it('projects through bindings and a nested Router target into pathname and hash', async () => {
    const bridge = createWebRouterBridge({ basePath: '/application' });
    const nestedRouter = new Router({
      routes: [
        new Route({
          address: segments('inspect', param('id')),
          load: async () => ({}),
          token: InspectorRoute,
        }),
      ],
    });
    const rootRouter = new Router({
      routes: [
        new Route({
          address: segments('ones', param('id')),
          routing: [nestedRouter],
          token: OneRoute,
        }),
      ],
    });
    let target: NavigationState | undefined;
    const navigate = createCoreNavigate({
      back: () => undefined,
      close: (navigation) => {
        target = navigation;
      },
      execute: (navigation) => {
        target = navigation;
      },
      router: rootRouter,
    });

    await navigate.through(OneRoute, { params: { id: 'one-1' } }).to(InspectorRoute, { params: { id: 'inspect-3' } });

    if (!target) {
      throw new Error('Navigation target was not created.');
    }

    expect(bridge.createHref(target)).toBe('/application/ones/one-1#inspect/inspect-3');
  });

  it('replaces the current history entry when internal navigation resolves to the same URL', async () => {
    const bridge = createWebRouterBridge();
    const abortController = new AbortController();

    await bridge.initialize({
      back: vi.fn().mockResolvedValue(false),
      cancelNavigation: vi.fn().mockReturnValue(false),
      confirm: vi.fn().mockResolvedValue(true),
      navigate: {} as NavigateServiceInterface,
      restore: vi.fn().mockResolvedValue(true),
      router,
      shouldBlockUnload: () => false,
      signal: abortController.signal,
    });

    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    bridge.commit(navigation(firstRoute), {
      history: historyEntry('replace', 'navigation:1', 0, 1),
      signal: abortController.signal,
      source: 'internal',
    });

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/first');

    await bridge.dispose();
  });

  it('rolls a cancelled Back traversal forward without replacing its history entry', async () => {
    const bridge = createWebRouterBridge();
    const restore = vi.fn<RouterBridgeInitializeContextInterface['restore']>().mockResolvedValue(true);
    const abortController = new AbortController();

    await bridge.initialize({
      back: vi.fn().mockResolvedValue(false),
      cancelNavigation: vi.fn().mockReturnValue(false),
      confirm: vi.fn().mockResolvedValue(true),
      navigate: {} as NavigateServiceInterface,
      restore,
      router,
      shouldBlockUnload: () => false,
      signal: abortController.signal,
    });
    bridge.commit(navigation(secondRoute), {
      history: historyEntry('push', 'navigation:2', 1, 2),
      signal: abortController.signal,
      source: 'internal',
    });
    restore.mockResolvedValue(false);

    await bridge.back();

    expect(window.location.pathname).toBe('/second');
    expect(restore).toHaveBeenLastCalledWith(
      expect.objectContaining({
        address: ['first'],
      }),
      { blockersConfirmed: false },
    );

    await bridge.dispose();
  });

  it('uses Navigation API pre-commit to cancel a blocked traversal before popstate', async () => {
    const navigationApi = installNavigationApi();
    const bridge = createWebRouterBridge();
    const restore = vi.fn<RouterBridgeInitializeContextInterface['restore']>().mockResolvedValue(true);
    const confirm = vi.fn<RouterBridgeInitializeContextInterface['confirm']>().mockResolvedValue(false);
    const abortController = new AbortController();

    await bridge.initialize({
      back: vi.fn().mockResolvedValue(false),
      cancelNavigation: vi.fn().mockReturnValue(false),
      confirm,
      navigate: {} as NavigateServiceInterface,
      restore,
      router,
      shouldBlockUnload: () => false,
      signal: abortController.signal,
    });

    const event = createTraverseEvent(new URL('/second', window.location.href).href);

    navigationApi.dispatchEvent(event);
    const interceptOptions = vi.mocked(event.intercept).mock.calls[0]?.[0];

    await expect(interceptOptions?.precommitHandler?.({} as NavigationPrecommitController)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/first');

    await bridge.dispose();
  });

  it('passes a pre-commit decision only to the matching popstate restore', async () => {
    const navigationApi = installNavigationApi();
    const bridge = createWebRouterBridge();
    const restore = vi.fn<RouterBridgeInitializeContextInterface['restore']>().mockResolvedValue(true);
    const abortController = new AbortController();

    await bridge.initialize({
      back: vi.fn().mockResolvedValue(false),
      cancelNavigation: vi.fn().mockReturnValue(false),
      confirm: vi.fn().mockResolvedValue(true),
      navigate: {} as NavigateServiceInterface,
      restore,
      router,
      shouldBlockUnload: () => false,
      signal: abortController.signal,
    });

    const event = createTraverseEvent(new URL('/second', window.location.href).href);

    navigationApi.dispatchEvent(event);
    const interceptOptions = vi.mocked(event.intercept).mock.calls[0]?.[0];

    await interceptOptions?.precommitHandler?.({} as NavigationPrecommitController);
    window.history.pushState(null, '', '/second');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await vi.waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
    expect(restore).toHaveBeenLastCalledWith(expect.objectContaining({ address: ['second'] }), {
      blockersConfirmed: true,
    });

    await bridge.dispose();
  });

  it('delegates native beforeunload confirmation to the core blocker state', async () => {
    const bridge = createWebRouterBridge();
    const shouldBlockUnload = vi.fn().mockReturnValue(true);
    const abortController = new AbortController();

    await bridge.initialize({
      back: vi.fn().mockResolvedValue(false),
      cancelNavigation: vi.fn().mockReturnValue(false),
      confirm: vi.fn().mockResolvedValue(true),
      navigate: {} as NavigateServiceInterface,
      restore: vi.fn().mockResolvedValue(true),
      router,
      shouldBlockUnload,
      signal: abortController.signal,
    });

    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(shouldBlockUnload).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);

    await bridge.dispose();
  });
});

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

const createTraverseEvent = (url: string): NavigateEvent => {
  const event = new Event('navigate', { cancelable: true }) as NavigateEvent;

  Object.defineProperties(event, {
    canIntercept: { value: true },
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

const navigation = (route: Route): NavigationState => {
  return Object.freeze({
    boundary: null,
    initiator: null,
    pendingNestedAddress: null,
    replace: false,
    revalidation: Object.freeze({ kind: 'branch' }),
    root: Object.freeze({
      child: null,
      owner: null,
      path: Object.freeze([
        Object.freeze({
          params: Object.freeze({}),
          route,
          token: route === firstRoute ? FirstRoute : SecondRoute,
        }),
      ]),
      query: Object.freeze({}),
      router,
    }),
    state: null,
  });
};

const historyEntry = (action: 'push' | 'replace', id: string, index: number, length: number) =>
  Object.freeze({ action, id, index, length });
