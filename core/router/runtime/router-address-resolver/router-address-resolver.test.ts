import { describe, expect, it } from 'vitest';

import { segments } from '../../declaration/address';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';

import { resolveRouterBridgeLocation } from './router-address-resolver.ts';

describe('resolveRouterBridgeLocation nested query ownership', () => {
  const createRouter = () => {
    const frame = new Route({ address: segments('edit'), load: async () => ({}) });
    const nested = new Router({ routes: [frame] });
    const host = new Route({ address: segments('host'), load: async () => ({}), routing: [nested] });

    return { router: new Router({ routes: [host] }), nested };
  };

  it('preserves root query when the nested address does not match a Router', () => {
    const { router } = createRouter();
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['host'],
      nested: { address: ['unknown'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: undefined,
    });

    expect(navigation.root.query).toEqual({ main: 'yes' });
    expect(navigation.root.child).toBeNull();
    expect(navigation.boundary).toBeNull();
  });

  it('does not apply nested query to an unmatched root address', () => {
    const { router } = createRouter();
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['unknown'],
      nested: { address: ['edit'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: undefined,
    });

    expect(navigation.root.query).toEqual({ main: 'yes' });
    expect(navigation.root.child).toBeNull();
    expect(navigation.boundary?.type).toBe('not-found');
  });

  it('keeps queries separate when the nested route matches directly', () => {
    const { router, nested } = createRouter();
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['host'],
      nested: { address: ['edit'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: undefined,
    });

    expect(navigation.root.query).toEqual({ main: 'yes' });
    expect(navigation.root.child?.query).toEqual({ modal: 'yes' });
    expect(navigation.root.child?.router).toBe(nested);
  });
});
