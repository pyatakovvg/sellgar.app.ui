import { describe, expect, it, vi } from 'vitest';

import { param, segments } from '../../declaration/address';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { resolveRouterBridgeLocation } from '../router-address-resolver';
import * as RouterGraph from '../router-graph';

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
  it('uses the cached route index without enumerating the graph on each resolution', () => {
    const { router, phone } = createRouter();
    const graph = RouterGraph.getRouterGraph(router);
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['customer', 'sign-in', 'phone'],
      nested: null,
      query: {},
      state: undefined,
    });
    const indexedGraph = {
      ...graph,
      get nodes(): typeof graph.nodes {
        throw new Error('Navigation resolution must use the cached route index.');
      },
    };
    const lookup = vi.spyOn(RouterGraph, 'getRouterGraph').mockReturnValue(indexedGraph);

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

        expect(candidate?.target.routes.at(-1)?.node.route).toBe(phone);
      }
    } finally {
      lookup.mockRestore();
    }
  });

  it('does not select a child of a structural route without an explicit default for an empty address', () => {
    const signIn = new Route({ address: segments('sign-in'), load: async () => ({}) });
    const passwordSet = new Route({ address: segments('password', 'set'), load: async () => ({}) });
    const publicRoutes = new Route({ routes: [signIn, passwordSet] });
    const terminals = new Route({ address: segments('terminals'), load: async () => ({}) });
    const authorizedRoutes = new Route({ defaultTo: Router.firstAvailable(), routes: [terminals] });
    const router = new Router({ routes: [publicRoutes, authorizedRoutes] });
    const navigation = resolveRouterBridgeLocation(router, {
      address: [],
      nested: null,
      query: {},
      state: undefined,
    });

    const candidates = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.target.routes.map((entry) => entry.node.route)).toEqual([authorizedRoutes, terminals]);
  });

  it('resolves an explicit root index without treating its policies as availability probes', () => {
    const index = new Route({ load: async () => ({}) });
    const parent = new Route({ routes: [index] });
    const router = new Router({ routes: [parent] });
    const navigation = resolveRouterBridgeLocation(router, { address: [], nested: null, query: {}, state: undefined });
    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);
    expect(candidate?.target.routes.map((entry) => entry.node.route)).toEqual([parent, index]);
    expect(candidate?.probeCanMatch).toBe(false);
  });

  it('keeps availability probing for an explicit first-available default', () => {
    const page = new Route({ address: segments('page'), load: async () => ({}) });
    const parent = new Route({ defaultTo: Router.firstAvailable(), routes: [page] });
    const router = new Router({ routes: [parent] });
    const navigation = resolveRouterBridgeLocation(router, { address: [], nested: null, query: {}, state: undefined });
    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);
    expect(candidate?.probeCanMatch).toBe(true);
  });

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

describe('resolveNavigationCandidates deferred nested address', () => {
  it('restores a nested route owned by the root index Route', () => {
    const frame = new Route({ address: segments('inspect', param('id')), load: async () => ({}) });
    const nested = new Router({ routes: [frame] });
    const host = new Route({ load: async () => ({}), routing: [nested] });
    const router = new Router({ routes: [host] });
    const navigation = resolveRouterBridgeLocation(router, {
      address: [],
      nested: { address: ['inspect', '17'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: { restored: true },
    });

    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidate?.navigation.root.query).toEqual({ main: 'yes' });
    expect(candidate?.navigation.root.child?.query).toEqual({ modal: 'yes' });
    expect(candidate?.target.child?.routes.at(-1)?.node.route).toBe(frame);
    expect(candidate?.target.child?.routes.at(-1)?.params).toEqual({ id: '17' });
    expect(candidate?.navigation.pendingNestedAddress).toBeNull();
    expect(candidate?.navigation.state).toEqual({ restored: true });
  });

  it('restores a nested route owned by an explicit default target', () => {
    class HostRoute {}
    const frame = new Route({ address: segments('inspect'), load: async () => ({}) });
    const nested = new Router({ routes: [frame] });
    const host = new Route({
      token: HostRoute,
      address: segments('screen'),
      load: async () => ({}),
      routing: [nested],
    });
    const group = new Route({ address: segments('group'), defaultTo: HostRoute, routes: [host] });
    const router = new Router({ routes: [group] });
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['group'],
      nested: { address: ['inspect'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: undefined,
    });

    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidate?.target.routes.at(-1)?.node.route).toBe(host);
    expect(candidate?.target.child?.routes.at(-1)?.node.route).toBe(frame);
    expect(candidate?.navigation.root.query).toEqual({ main: 'yes' });
    expect(candidate?.navigation.root.child?.query).toEqual({ modal: 'yes' });
    expect(candidate?.navigation.replace).toBe(true);
    expect(candidate?.navigation.pendingNestedAddress).toBeNull();
  });

  it('resolves nested address independently for each firstAvailable candidate', () => {
    const firstFrame = new Route({ address: segments('inspect'), load: async () => ({}) });
    const secondFrame = new Route({ address: segments('inspect'), load: async () => ({}) });
    const first = new Route({
      address: segments('first'),
      load: async () => ({}),
      routing: [new Router({ routes: [firstFrame] })],
    });
    const second = new Route({
      address: segments('second'),
      load: async () => ({}),
      routing: [new Router({ routes: [secondFrame] })],
    });
    const group = new Route({
      address: segments('group'),
      defaultTo: Router.firstAvailable(),
      routes: [first, second],
    });
    const router = new Router({ routes: [group] });
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['group'],
      nested: { address: ['inspect'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: undefined,
    });

    const candidates = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.target.child?.routes.at(-1)?.node.route)).toEqual([
      firstFrame,
      secondFrame,
    ]);
    for (const candidate of candidates) {
      expect(candidate.probeCanMatch).toBe(true);
      expect(candidate.navigation.root.query).toEqual({ main: 'yes' });
      expect(candidate.navigation.root.child?.query).toEqual({ modal: 'yes' });
      expect(candidate.navigation.pendingNestedAddress).toBeNull();
    }
  });

  it('preserves root query when a nested address is still unknown after default expansion', () => {
    class HostRoute {}
    const host = new Route({ token: HostRoute, address: segments('screen'), load: async () => ({}) });
    const router = new Router({
      routes: [new Route({ address: segments('group'), defaultTo: HostRoute, routes: [host] })],
    });
    const navigation = resolveRouterBridgeLocation(router, {
      address: ['group'],
      nested: { address: ['unknown'], query: { modal: 'yes' } },
      query: { main: 'yes' },
      state: undefined,
    });

    const [candidate] = resolveNavigationCandidates(router, navigation, undefined);

    expect(candidate?.navigation.root.query).toEqual({ main: 'yes' });
    expect(candidate?.navigation.root.child).toBeNull();
    expect(candidate?.navigation.boundary).toBeNull();
    expect(candidate?.navigation.pendingNestedAddress).toBeNull();
  });
});
