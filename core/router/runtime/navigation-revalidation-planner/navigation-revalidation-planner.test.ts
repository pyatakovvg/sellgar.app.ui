import { describe, expect, it } from 'vitest';

import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { createNavigationOperation, type NavigationTrigger } from '../navigation-operation';
import type { NavigationRevalidation, NavigationRouterState, NavigationState } from '../navigation-state';

import { planNavigationRevalidation, planNavigationCollectionRestart } from './navigation-revalidation-planner.ts';

const createRouter = () => new Router({ routes: [new Route({ load: async () => ({}) })] });

const createRouterState = (
  router: Router,
  query: Readonly<Record<string, unknown>> = {},
  child: NavigationRouterState | null = null,
): NavigationRouterState => Object.freeze({ child, owner: null, path: [], query: Object.freeze(query), router });

const createNavigation = (root: NavigationRouterState, revalidation: NavigationRevalidation): NavigationState =>
  Object.freeze({
    boundary: null,
    initiator: null,
    pendingNestedAddress: null,
    replace: false,
    revalidation,
    root,
    state: undefined,
  });

const createFixture = () => {
  const parentRouter = createRouter();
  const childRouter = createRouter();
  const parent = Object.freeze({ id: Symbol('parent') });
  const child = Object.freeze({ id: Symbol('child') });
  const targets = Object.freeze([
    Object.freeze({ localChanged: false, router: parentRouter, target: parent }),
    Object.freeze({ localChanged: false, router: childRouter, target: child }),
  ]);
  const root = createRouterState(parentRouter, {}, createRouterState(childRouter));
  const previousNavigation = createNavigation(root, null);

  return { child, childRouter, parent, parentRouter, previousNavigation, root, targets };
};

describe('Navigation revalidation planner', () => {
  it('does not select targets when revalidation is disabled', () => {
    const { previousNavigation, root, targets } = createFixture();

    expect(
      planNavigationRevalidation({
        navigation: createNavigation(root, null),
        previousNavigation,
        targets,
      }),
    ).toEqual([]);
  });

  it('keeps target references and parent-to-child order for branch revalidation', () => {
    const { child, parent, previousNavigation, root, targets } = createFixture();

    const result = planNavigationRevalidation({
      navigation: createNavigation(root, { kind: 'branch' }),
      previousNavigation,
      targets,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(parent);
    expect(result[1]).toBe(child);
  });

  it('selects only targets belonging to the requested router', () => {
    const { child, childRouter, previousNavigation, root, targets } = createFixture();

    const result = planNavigationRevalidation({
      navigation: createNavigation(root, { kind: 'router', router: childRouter }),
      previousNavigation,
      targets,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(child);
  });

  it('does not fall back to the branch when the selected router has no target', () => {
    const { previousNavigation, root, targets } = createFixture();

    expect(
      planNavigationRevalidation({
        navigation: createNavigation(root, { kind: 'router', router: createRouter() }),
        previousNavigation,
        targets,
      }),
    ).toEqual([]);
  });

  it.each([
    { parentChanged: false, childChanged: false, selected: ['parent', 'child'] },
    { parentChanged: true, childChanged: false, selected: ['parent'] },
    { parentChanged: false, childChanged: true, selected: ['child'] },
    { parentChanged: true, childChanged: true, selected: ['parent', 'child'] },
  ])('selects restore targets by changed scope queries: %j', ({ parentChanged, childChanged, selected }) => {
    const fixture = createFixture();
    const root = createRouterState(
      fixture.parentRouter,
      parentChanged ? { sort: 'asc' } : {},
      createRouterState(fixture.childRouter, childChanged ? { tab: 'history' } : {}),
    );

    const result = planNavigationRevalidation({
      navigation: createNavigation(root, { kind: 'restore' }),
      previousNavigation: fixture.previousNavigation,
      targets: fixture.targets,
    });

    expect(result).toEqual(selected.map((key) => (key === 'parent' ? fixture.parent : fixture.child)));
  });

  it('uses existing query equality for array values rather than object identity', () => {
    const { childRouter, parentRouter, targets } = createFixture();

    const result = planNavigationRevalidation({
      navigation: createNavigation(
        createRouterState(parentRouter, { ids: ['a', 'b'] }, createRouterState(childRouter)),
        { kind: 'restore' },
      ),
      previousNavigation: createNavigation(
        createRouterState(parentRouter, { ids: ['a', 'b'] }, createRouterState(childRouter)),
        null,
      ),
      targets,
    });

    expect(result).toEqual([targets[0]!.target, targets[1]!.target]);
  });

  it('selects the complete branch for restore without a previous navigation', () => {
    const { child, parent, root, targets } = createFixture();

    expect(
      planNavigationRevalidation({
        navigation: createNavigation(root, { kind: 'restore' }),
        previousNavigation: undefined,
        targets,
      }),
    ).toEqual([parent, child]);
  });

  it.each(['branch', 'router', 'restore'] as const)('preserves the topology-change skip for %s selection', (kind) => {
    const { childRouter, previousNavigation, root, targets } = createFixture();
    const revalidation: NavigationRevalidation = kind === 'router' ? { kind, router: childRouter } : { kind };

    for (const index of [0, 1]) {
      expect(
        planNavigationRevalidation({
          navigation: createNavigation(root, revalidation),
          previousNavigation,
          targets: targets.map((target, targetIndex) => ({ ...target, localChanged: targetIndex === index })),
        }),
      ).toEqual([]);
    }
  });

  it('selects the changed parent query when a new child is prepared', () => {
    const { parentRouter, previousNavigation, root, targets } = createFixture();

    expect(
      planNavigationRevalidation({
        navigation: createNavigation({ ...root, query: { sort: 'asc' } }, { kind: 'restore' }),
        previousNavigation: { ...previousNavigation, root: createRouterState(parentRouter) },
        targets: [targets[0]!, { ...targets[1]!, localChanged: true }],
      }),
    ).toEqual([targets[0]!.target]);
  });

  it('does not keep another owner target when declarations are reused in a later plan', () => {
    const { parentRouter, previousNavigation, root, targets } = createFixture();
    const navigation = createNavigation(root, { kind: 'router', router: parentRouter });
    const first = planNavigationRevalidation({ navigation, previousNavigation, targets });
    const anotherOwner = Object.freeze({ id: Symbol('another owner') });
    const second = planNavigationRevalidation({
      navigation,
      previousNavigation,
      targets: [{ ...targets[0]!, target: anotherOwner }],
    });

    expect(first[0]).toBe(targets[0]!.target);
    expect(second[0]).toBe(anotherOwner);
  });

  it('accepts an empty target list', () => {
    const { previousNavigation, root } = createFixture();

    expect(
      planNavigationRevalidation({
        navigation: createNavigation(root, { kind: 'branch' }),
        previousNavigation,
        targets: [],
      }),
    ).toEqual([]);
  });
});

describe('Navigation collection restart planning', () => {
  const fixture = () => {
    const route = new Route({ load: async () => ({}) });
    const router = new Router({ routes: [route] });
    const root = { ...createRouterState(router), path: [{ route, params: {}, token: undefined }] };
    const navigation = createNavigation(root, { kind: 'branch' });
    return { route, router, navigation };
  };

  it.each<NavigationTrigger>(['target', 'root', 'bridge-request'])(
    'selects the resolved destination for %s navigation',
    (trigger) => {
      const { navigation, route, router } = fixture();
      const operation = createNavigationOperation(trigger, 'internal', navigation);
      expect(planNavigationCollectionRestart(navigation, operation)).toEqual({ route, router });
    },
  );

  it.each<NavigationTrigger>(['query', 'close', 'restore', 'history', 'session', 'recovery', 'redirect'])(
    'does not infer a restart from %s',
    (trigger) => {
      const { navigation } = fixture();
      expect(
        planNavigationCollectionRestart(navigation, createNavigationOperation(trigger, 'external', navigation)),
      ).toBeNull();
    },
  );

  it('selects the child destination instead of an unchanged ancestor', () => {
    const child = fixture();
    const parent = fixture();
    const navigation = createNavigation(
      { ...parent.navigation.root, child: child.navigation.root },
      { kind: 'branch' },
    );
    const operation = createNavigationOperation('target', 'internal', navigation);
    expect(planNavigationCollectionRestart(navigation, operation)).toEqual({
      route: child.route,
      router: child.router,
    });
  });

  it('follows redirects while retaining the origin of the explicit request', () => {
    const { navigation, route, router } = fixture();
    const original = createNavigationOperation('target', 'internal', navigation);
    const redirect = createNavigationOperation('redirect', 'internal', navigation, original);
    expect(planNavigationCollectionRestart(navigation, redirect)).toEqual({ route, router });
  });

  it('does not restart without an execution context, after a disabled refresh or at a not-found boundary', () => {
    const { navigation, router } = fixture();
    const operation = createNavigationOperation('target', 'internal', navigation);
    expect(planNavigationCollectionRestart(navigation)).toBeNull();
    expect(planNavigationCollectionRestart({ ...navigation, revalidation: null }, operation)).toBeNull();
    expect(
      planNavigationCollectionRestart(
        { ...navigation, boundary: { type: 'not-found', route: null, router } },
        operation,
      ),
    ).toBeNull();
  });
});
