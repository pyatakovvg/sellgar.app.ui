import { describe, expect, it, vi } from 'vitest';
import { segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { resolveRouteContentKind } from './route-content-kind';

describe('structural route content', () => {
  it('recognizes a lazy module without invoking its loader or reading module presentation', () => {
    const load = vi.fn(async () => ({}));
    const route = new Route({ load });
    expect(resolveRouteContentKind([{ route }], () => [])).toBe('module');
    expect(load).not.toHaveBeenCalled();
  });

  it('does not expose a layout beyond a pending replacement, but keeps a retained layout owner', () => {
    const leaf = new Route({ load: async () => ({}) });
    const parent = new Route({ routes: [leaf] });
    const routes = [{ route: parent }, { route: leaf }];
    const layout = class Layout {};
    expect(
      resolveRouteContentKind(routes, (route) => (route === leaf ? [layout] : []), { pendingAfterRouteCount: 1 }),
    ).toBeNull();
    expect(
      resolveRouteContentKind(routes, (route) => (route === parent ? [layout] : []), { pendingAfterRouteCount: 1 }),
    ).toBe('layout');
    expect(resolveRouteContentKind(routes, () => [layout], { pendingAfterRouteCount: 0 })).toBeNull();
  });

  it('uses the selected terminal route and never falls back to an ancestor module', () => {
    const leaf = new Route({ address: segments('empty'), routes: [new Route({ load: async () => ({}) })] });
    const parent = new Route({ load: async () => ({}), routes: [leaf] });
    expect(resolveRouteContentKind([{ route: parent }, { route: leaf }], () => [])).toBeNull();
    expect(resolveRouteContentKind([], () => [])).toBeNull();
  });

  it('propagates an explicit native outlet owner through a route range', () => {
    const route = new Route({ load: async () => ({}) });
    const routes = [{ route }];
    expect(resolveRouteContentKind(routes, () => [], { outletKind: 'layout' })).toBe('layout');
    expect(resolveRouteContentKind(routes, () => [], { outletKind: null })).toBeNull();
    expect(resolveRouteContentKind(routes, () => [], { startIndex: 1, outletKind: 'module' })).toBe('module');
    expect(resolveRouteContentKind(routes, () => [], { pendingAfterRouteCount: 1, outletKind: 'module' })).toBeNull();
  });
});
