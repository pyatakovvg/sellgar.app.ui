import { describe, expect, it, vi } from 'vitest';

// These tests inject their transport; loading the OS Linking module is outside this contract.
vi.mock('../../transport/native-linking-transport', () => ({
  createNativeLinkingTransport: () => {
    throw new Error('Test must supply a transport');
  },
}));

import type {
  RouterBridgeHistoryAction,
  RouterBridgeInitializeContextInterface,
  RouterBridgeLocationInterface,
} from '../../../../core/router/bridge/router-bridge';
import { param, segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import { matchesNavigationState } from '../../../../core/router/runtime/navigation-state';
import { resolveCoreNavigation } from '../../../../core/router/service/navigate-service';
import type {
  NativeRouterTransportInterface,
  NativeRouterTransportListener,
} from '../../transport/native-router-transport';
import { resolveNativeRouterBridge, createNativeRouterBridge, type NativeRouterBridge } from './native-router-bridge';

abstract class ProductsRoute {}

abstract class ProductRoute {
  abstract readonly productId: string;
}

const router = new Router({
  routes: [
    new Route({
      address: segments('products'),
      routes: [new Route({ address: segments(param('productId')), load: async () => ({}), token: ProductRoute })],
      token: ProductsRoute,
    }),
  ],
});

describe('NativeRouterBridge', () => {
  it('keeps the bridge runtime behind a stable opaque reference', () => {
    const reference = createNativeRouterBridge({ transport: new TestTransport() });
    const bridge = resolveNativeRouterBridge(reference);

    expect(resolveNativeRouterBridge(reference)).toBe(bridge);
    expect(Object.isFrozen(reference)).toBe(true);
    expect('initialize' in reference).toBe(false);
    expect('completePresentation' in reference).toBe(false);
    expect('registerDriver' in reference).toBe(false);
  });

  it('rejects an unregistered bridge reference', () => {
    // @ts-expect-error Application code cannot construct a bridge reference.
    expect(() => resolveNativeRouterBridge({})).toThrow(/createNativeRouterBridge/);
  });

  it('selects retained ModuleRuntime lifecycle', () => {
    expect(
      resolveNativeRouterBridge(createNativeRouterBridge({ transport: new TestTransport() })).runtimeRetention,
    ).toBe('retain');
  });

  it('keeps query changes inside the current screen runtime', () => {
    const initial = resolveCoreNavigation(router, ProductsRoute, { query: { search: 'dress' } }, undefined);
    const filtered = resolveCoreNavigation(router, ProductsRoute, { query: { search: 'skirt' } }, initial);

    expect(matchesNavigationState(filtered, initial)).toBe(true);
    expect(matchesNavigationState(initial, filtered)).toBe(true);
  });

  it('creates different stack entries for different Route params', () => {
    const first = resolveCoreNavigation(router, ProductRoute, { params: { productId: 'first' } }, undefined);
    const second = resolveCoreNavigation(router, ProductRoute, { params: { productId: 'second' } }, first);

    expect(matchesNavigationState(second, first)).toBe(false);
    expect(matchesNavigationState(first, second)).toBe(false);
  });

  it('restores an initial native location instead of resolving the root', async () => {
    const initial = location(['products', 'first']);
    const transport = new TestTransport(initial);
    const restore = vi.fn(async () => true);
    const navigateRoot = vi.fn(async () => undefined);
    const bridge = resolveNativeRouterBridge(createNativeRouterBridge({ transport }));

    await bridge.initialize(context({ navigateRoot, restore }));

    expect(restore).toHaveBeenCalledWith(initial, { blockersConfirmed: false });
    expect(navigateRoot).not.toHaveBeenCalled();
  });

  it('projects push, pop and session reset commits from authoritative core history', async () => {
    const bridge = resolveNativeRouterBridge(createNativeRouterBridge({ transport: new TestTransport() }));
    const products = resolveCoreNavigation(router, ProductsRoute, {}, undefined);
    const first = resolveCoreNavigation(router, ProductRoute, { params: { productId: 'first' } }, products);

    await commit(bridge, products, 'replace', 'navigation:1', 0, 1);
    await commit(bridge, first, 'push', 'navigation:2', 1, 2);

    expect(bridge.getSnapshot().entries.map(({ id }) => id)).toEqual(['navigation:1', 'navigation:2']);

    await commit(bridge, products, 'pop', 'navigation:1', 0, 1);

    expect(bridge.getSnapshot().entries.map(({ id }) => id)).toEqual(['navigation:1']);

    await commit(bridge, first, 'reset', 'navigation:3', 0, 1);

    expect(bridge.getSnapshot().entries.map(({ id }) => id)).toEqual(['navigation:3']);
    expect(bridge.getSnapshot().entries[0]?.location.entryId).toBe('navigation:3');
  });

  it('passes runtime deep links into the same core restore pipeline', async () => {
    const transport = new TestTransport();
    const restore = vi.fn(async () => true);
    const bridge = resolveNativeRouterBridge(createNativeRouterBridge({ transport }));

    await bridge.initialize(context({ restore }));
    const next = location(['products', 'second']);
    transport.emit(next);

    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith(next, { blockersConfirmed: false }));
  });

  it('exposes Back transition while core restores the previous entry', async () => {
    const bridge = resolveNativeRouterBridge(createNativeRouterBridge({ transport: new TestTransport() }));
    const back = vi.fn(async () => {
      expect(bridge.getSnapshot().backInProgress).toBe(true);
      return true;
    });

    await bridge.initialize(context({ back }));
    await bridge.back();

    expect(back).toHaveBeenCalledOnce();
    expect(bridge.getSnapshot().backInProgress).toBe(false);
  });

  it('cancels pending forward navigation without starting a Back transition', async () => {
    const bridge = resolveNativeRouterBridge(createNativeRouterBridge({ transport: new TestTransport() }));
    const back = vi.fn(async () => true);

    await bridge.initialize(
      context({
        back,
        cancelPendingNavigation: () => true,
      }),
    );
    await bridge.back();

    expect(back).not.toHaveBeenCalled();
    expect(bridge.getSnapshot().backInProgress).toBe(false);
  });

  it('rolls back a rejected physical traversal to the committed transport snapshot', async () => {
    const transport = new TestTransport();
    const bridge = resolveNativeRouterBridge(createNativeRouterBridge({ transport }));
    const products = resolveCoreNavigation(router, ProductsRoute, {}, undefined);
    const first = resolveCoreNavigation(router, ProductRoute, { params: { productId: 'first' } }, products);

    await bridge.initialize(context({ restore: vi.fn(async () => false) }));
    await commit(bridge, products, 'replace', 'navigation:1', 0, 1);
    await commit(bridge, first, 'push', 'navigation:2', 1, 2);

    const restored = await bridge.restore({ ...bridge.getSnapshot().entries[0]!.location }, false);

    expect(restored).toBe(false);
    expect(bridge.getSnapshot().entries.map(({ id }) => id)).toEqual(['navigation:1', 'navigation:2']);
  });
});

class TestTransport implements NativeRouterTransportInterface {
  private listener: NativeRouterTransportListener | null = null;

  constructor(private readonly initial: RouterBridgeLocationInterface | null = null) {}

  async getInitialLocation(): Promise<RouterBridgeLocationInterface | null> {
    return this.initial;
  }

  subscribe(listener: NativeRouterTransportListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  emit(value: RouterBridgeLocationInterface): void {
    this.listener?.(value);
  }
}

const context = (
  options: {
    readonly back?: () => Promise<boolean>;
    readonly cancelPendingNavigation?: () => boolean;
    readonly navigateRoot?: () => Promise<void>;
    readonly restore?: RouterBridgeInitializeContextInterface['restore'];
  } = {},
): RouterBridgeInitializeContextInterface => ({
  back: options.back ?? (async () => false),
  cancelNavigation: options.cancelPendingNavigation ?? (() => false),
  confirm: async () => true,
  navigate: {
    root: options.navigateRoot ?? (async () => undefined),
  } as RouterBridgeInitializeContextInterface['navigate'],
  navigateRequest: async () => true,
  restore: options.restore ?? (async () => true),
  router,
  shouldBlockUnload: () => false,
  signal: new AbortController().signal,
});

const location = (address: readonly string[]): RouterBridgeLocationInterface =>
  Object.freeze({ address, nested: null, query: Object.freeze({}), state: undefined });

const commit = (
  bridge: NativeRouterBridge,
  navigation: ReturnType<typeof resolveCoreNavigation>,
  action: RouterBridgeHistoryAction,
  id: string,
  index: number,
  length: number,
) =>
  bridge.commit(navigation, {
    history: { action, id, index, length },
    locationAction: 'apply',
    signal: new AbortController().signal,
    source: 'internal',
  });
