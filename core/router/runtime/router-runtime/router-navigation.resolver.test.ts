import { describe, expect, it } from 'vitest';

import { segments } from '../../declaration/address';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { resolveRouterBridgeLocation } from '../router-address-resolver';

import { resolveNavigationCandidates } from './router-navigation.resolver.ts';

class PhoneRoute {}

const createRouter = () => {
  const phone = new Route({ token: PhoneRoute, address: segments('phone'), load: async () => ({}) });
  const signIn = new Route({ address: segments('sign-in'), routes: [phone] });
  const shell = new Route({ routes: [signIn] });
  const customer = new Route({ address: segments('customer'), routes: [shell] });

  return { router: new Router({ routes: [customer] }), phone };
};

describe('resolveNavigationCandidates notFound', () => {
  it.each(['unknown', 'customer.unknown', 'customer.sign-in.unknown'])(
    'preserves the matched ancestry for %s without selecting descendant routes',
    (screen) => {
      const { router } = createRouter();
      const snapshot = { screen };
      const navigation = resolveRouterBridgeLocation(router, {
        address: screen.split('.'),
        nested: null,
        query: { language: 'ru' },
        state: snapshot,
      });

      expect(navigation.boundary?.type).toBe('not-found');

      const candidates = resolveNavigationCandidates(router, navigation, undefined);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.navigation).toEqual(navigation);
      expect(candidates[0]?.navigation.state).toBe(snapshot);
      expect(candidates[0]?.probeCanMatch).toBe(false);
      expect(candidates[0]?.target.routes.map((entry) => entry.node.route)).toEqual(
        navigation.root.path.map((entry) => entry.route),
      );
    },
  );

  it('does not apply defaultTo to an unmatched address', () => {
    const child = new Route({ token: PhoneRoute, address: segments('phone'), load: async () => ({}) });
    const router = new Router({
      routes: [new Route({ address: segments('sign-in'), defaultTo: PhoneRoute, routes: [child] })],
    });
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['sign-in', 'unknown'],
      nested: null,
      query: {},
      state: undefined,
    });

    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidate?.navigation).toEqual(navigation);
    expect(candidate?.target.routes).toHaveLength(1);
    expect(candidate?.navigation.replace).toBe(false);
  });

  it('preserves a notFound boundary in a nested router', () => {
    const { router: nested } = createRouter();
    const router = new Router({
      routes: [new Route({ address: segments('host'), load: async () => ({}), routing: [nested] })],
    });
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['host'],
      nested: { address: ['customer', 'sign-in', 'unknown'], query: {} },
      query: {},
      state: undefined,
    });

    expect(navigation.boundary?.router).toBe(nested);

    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidate?.navigation).toEqual(navigation);
    expect(candidate?.target.child?.routes.map((entry) => entry.node.route)).toEqual(
      navigation.root.child?.path.map((entry) => entry.route),
    );
  });

  it('still resolves an exact address to its module', () => {
    const { router, phone } = createRouter();
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['customer', 'sign-in', 'phone'],
      nested: null,
      query: {},
      state: undefined,
    });

    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidate?.navigation.boundary).toBeNull();
    expect(candidate?.target.routes.at(-1)?.node.route).toBe(phone);
  });
});
