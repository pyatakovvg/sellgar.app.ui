import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ApplicationRouterRuntimeEntry } from '../../../../core/application/lifecycle/application';
import { param, segments } from '../../../../core/router/declaration/address';
import { Router } from '../../../../core/router/declaration/router';
import type { NavigationRouteEntry, NavigationState } from '../../../../core/router/runtime/navigation-state';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { ScreenRuntime } from '../../../screen/runtime/screen-runtime';
import { Route } from '../../declaration/route';
import {
  resolveNativeRouteIndexPresentationKey,
  resolveNativeRoutePresentationKey,
} from './native-route-projection.ts';
import * as PresentationKeys from './native-route-projection.ts';
import { NativeRouteProjectionRuntime, type NativeRouteProjectionInput } from './native-route-projection-runtime.tsx';

vi.mock('../../../screen/rendering/screen-renderer', () => ({ ScreenRenderer: () => null }));
vi.mock('../../rendering/route-host', () => ({ RouteHost: () => null, RouteModuleHost: () => null }));

const fixture = () => {
  const leaf = new Route({ address: segments('leaf', param('item')), load: async () => ({}) });
  const parent = new Route({ address: segments('parent', param('id')), load: async () => ({}), routes: [leaf] });
  const router = new Router({ routes: [parent] });
  const runtimes = new Map<string, RouteActivationRuntime<ModuleMetadata>>();
  const entry = (id: string, item?: string): ApplicationRouterRuntimeEntry<ModuleMetadata> => {
    const path: NavigationRouteEntry[] = [{ params: { id }, route: parent, token: undefined }];
    if (item !== undefined) path.push({ params: { item }, route: leaf, token: undefined });
    const navigation: NavigationState = {
      boundary: null,
      initiator: null,
      pendingNestedAddress: null,
      replace: false,
      revalidation: null,
      root: { child: null, owner: null, path, query: {}, router },
      state: undefined,
    };
    const routes = path.map((node, depth) => {
      const key = resolveNativeRoutePresentationKey(node, depth);
      let runtime = runtimes.get(key);
      // Controlled core port: the projection only reads route identity; no fake lifecycle is executed.
      if (!runtime) {
        runtime = { route: node.route } as RouteActivationRuntime<ModuleMetadata>;
        runtimes.set(key, runtime);
      }
      return runtime;
    });
    return { activation: { navigation }, tree: { routes } } as unknown as ApplicationRouterRuntimeEntry<ModuleMetadata>;
  };
  const input = (entries: readonly ApplicationRouterRuntimeEntry<ModuleMetadata>[]): NativeRouteProjectionInput => ({
    components: {},
    current: entries.at(-1)?.activation.navigation,
    dismissing: false,
    entries: entries.map((value) => ({ ...value, phase: 'focused' })),
    pending: null,
    pendingTree: null,
    runtimeEntries: entries,
    source: entries.at(-1)?.activation.navigation,
  });
  return { entry, input };
};

const childOutlet = (runtime: ScreenRuntime, key: string): ScreenRuntime => {
  const scene = runtime.getSnapshot().scenes.find((candidate) => candidate.key === key)!;
  const host = scene.getSnapshot().content as React.ReactElement<{
    children: React.ReactElement<{ runtime: ScreenRuntime }>;
  }>;
  return host.props.children.props.runtime;
};

describe('native retained route projection', () => {
  it('does not serialize terminal leaf keys for unused descendant index buckets', () => {
    const f = fixture();
    const entries = Array.from({ length: 20 }, (_, item) => f.entry('shared', String(item)));
    const input = f.input(entries);
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    projection.project(input);
    const snapshot = projection.root.getSnapshot();
    const leaf = entries[0]!.activation.navigation.root.path[1]!.route;
    const resolveKey = vi.spyOn(PresentationKeys, 'resolveNativeRoutePresentationKey');

    try {
      projection.project(input);

      // A leaf still needs its candidate and scene identity. It owns no outlet,
      // so indexing a third leaf identity per retained entry is wasted work.
      const leafKeyCalls = resolveKey.mock.calls.filter(([entry]) => entry.route === leaf);
      expect(leafKeyCalls).toHaveLength(entries.length * 2);
      expect(projection.root.getSnapshot()).toBe(snapshot);
    } finally {
      resolveKey.mockRestore();
    }
  });

  it('indexes retained entries once rather than rescanning all entries for every parameterized outlet', () => {
    const f = fixture();
    const entries = Array.from({ length: 80 }, (_, id) => f.entry(String(id), 'detail'));
    let reads = 0;
    const observed = new Proxy(entries, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const input = { ...f.input(entries), runtimeEntries: observed };
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    projection.project(input);
    expect(reads).toBeLessThanOrEqual(entries.length * 2);
    expect(projection.root.getSnapshot().scenes).toHaveLength(80);
    const snapshot = projection.root.getSnapshot();
    reads = 0;
    projection.project(input);
    expect(reads).toBeLessThanOrEqual(entries.length * 2);
    expect(projection.root.getSnapshot()).toBe(snapshot);
  });

  it('keeps retained children in their own ancestry, restores Back and disposes removed scenes', () => {
    const f = fixture();
    const oneA = f.entry('one', 'a');
    const oneB = f.entry('one', 'b');
    const twoA = f.entry('two', 'a');
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    projection.project(f.input([oneA, oneB, twoA]));
    const oneKey = resolveNativeRoutePresentationKey(oneA.activation.navigation.root.path[0], 0);
    const twoKey = resolveNativeRoutePresentationKey(twoA.activation.navigation.root.path[0], 0);
    const oneOutlet = childOutlet(projection.root, oneKey);
    const twoOutlet = childOutlet(projection.root, twoKey);
    expect(oneOutlet.getSnapshot().scenes).toHaveLength(2);
    expect(twoOutlet.getSnapshot().scenes).toHaveLength(1);
    const oneContent = projection.root
      .getSnapshot()
      .scenes.find((scene) => scene.key === oneKey)!
      .getSnapshot().content;
    const released = vi.fn();
    projection.root
      .getSnapshot()
      .scenes.find((scene) => scene.key === twoKey)!
      .onDispose(released);

    projection.project({ ...f.input([oneA, oneB]), dismissing: true, source: twoA.activation.navigation });
    expect(projection.root.getCurrentKey()).toBe(oneKey);
    expect(childOutlet(projection.root, oneKey)).toBe(oneOutlet);
    expect(projection.root.getSnapshot().scenes[0].getSnapshot().content).toBe(oneContent);
    expect(released).toHaveBeenCalledTimes(1);
    expect(oneOutlet.getCurrentKey()).toBe(
      resolveNativeRoutePresentationKey(oneB.activation.navigation.root.path[1], 1),
    );
  });

  it('retains an index screen alongside its children', () => {
    const f = fixture();
    const index = f.entry('one');
    const leaf = f.entry('one', 'a');
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    projection.project(f.input([index, leaf]));
    const owner = index.activation.navigation.root.path[0];
    const outlet = childOutlet(projection.root, resolveNativeRoutePresentationKey(owner, 0));
    expect(outlet.getSnapshot().machine.retainedKeys).toContain(resolveNativeRouteIndexPresentationKey(owner, 1));
    projection.project(f.input([index]));
    expect(outlet.getCurrentKey()).toBe(resolveNativeRouteIndexPresentationKey(owner, 1));
    expect(outlet.getSnapshot().scenes).toHaveLength(1);
  });

  it('disposes a replaced child scene while retaining older screens for Back', () => {
    const f = fixture();
    const first = f.entry('one', 'a');
    const second = f.entry('one', 'b');
    const replacement = f.entry('one', 'c');
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    projection.project(f.input([first, second]));
    const parentKey = resolveNativeRoutePresentationKey(first.activation.navigation.root.path[0], 0);
    const outlet = childOutlet(projection.root, parentKey);
    const firstKey = resolveNativeRoutePresentationKey(first.activation.navigation.root.path[1], 1);
    const secondKey = resolveNativeRoutePresentationKey(second.activation.navigation.root.path[1], 1);
    const replacementKey = resolveNativeRoutePresentationKey(replacement.activation.navigation.root.path[1], 1);
    const firstScene = outlet.getSnapshot().scenes.find((scene) => scene.key === firstKey)!;
    const released = vi.fn();
    outlet
      .getSnapshot()
      .scenes.find((scene) => scene.key === secondKey)!
      .onDispose(released);

    projection.project(f.input([first, replacement]));

    expect(childOutlet(projection.root, parentKey)).toBe(outlet);
    expect(outlet.getSnapshot().scenes.map(({ key }) => key)).toEqual([firstKey, replacementKey]);
    expect(outlet.getSnapshot().scenes[0]).toBe(firstScene);
    expect(outlet.getCurrentKey()).toBe(replacementKey);
    expect(released).toHaveBeenCalledOnce();

    projection.project({ ...f.input([first]), dismissing: true, source: replacement.activation.navigation });
    expect(outlet.getCurrentKey()).toBe(firstKey);
    expect(outlet.getSnapshot().scenes).toEqual([firstScene]);
    expect(released).toHaveBeenCalledOnce();
  });

  it('preserves a pending child fallback and restores committed content on cancellation', () => {
    const f = fixture();
    const first = f.entry('one', 'a');
    const pending = f.entry('one', 'b');
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    const components = { fallback: <span>preparing</span> };
    const input = { ...f.input([first]), components };
    projection.project(input);
    const ownerKey = resolveNativeRoutePresentationKey(first.activation.navigation.root.path[0], 0);
    const outlet = childOutlet(projection.root, ownerKey);
    const initial = outlet.getSnapshot().scenes[0];

    projection.project({ ...input, pending: pending.activation.navigation });
    const pendingKey = resolveNativeRoutePresentationKey(pending.activation.navigation.root.path[1], 1);
    expect(outlet.getCurrentKey()).toBe(pendingKey);
    expect(
      outlet
        .getSnapshot()
        .scenes.find((scene) => scene.key === pendingKey)!
        .getSnapshot().content,
    ).toBe(components.fallback);
    expect(outlet.getSnapshot().scenes).toContain(initial);

    projection.project(input);
    expect(outlet.getCurrentKey()).toBe(initial.key);
    expect(outlet.getSnapshot().scenes).toEqual([initial]);

    projection.project({ ...input, pending: pending.activation.navigation, pendingTree: pending.tree });
    expect(outlet.getCurrentKey()).toBe(pendingKey);
    expect(
      outlet
        .getSnapshot()
        .scenes.find((scene) => scene.key === pendingKey)!
        .getSnapshot().content,
    ).not.toBe(components.fallback);
  });

  it('chooses the newest runtime for duplicate retained identities', () => {
    const f = fixture();
    const old = f.entry('one', 'a');
    const latest = {
      ...old,
      tree: {
        ...old.tree,
        routes: old.tree.routes.map((runtime) => ({ route: runtime.route }) as RouteActivationRuntime<ModuleMetadata>),
      },
    };
    const focused = f.entry('two', 'b');
    const projection = new NativeRouteProjectionRuntime(vi.fn());
    projection.project(f.input([old, latest, focused]));
    const ownerKey = resolveNativeRoutePresentationKey(old.activation.navigation.root.path[0], 0);
    const parent = projection.root.getSnapshot().scenes.find((scene) => scene.key === ownerKey)!;
    const host = parent.getSnapshot().content as React.ReactElement<{
      runtime: RouteActivationRuntime<ModuleMetadata>;
    }>;
    expect(host.props.runtime).toBe(latest.tree.routes[0]);
    const outlet = childOutlet(projection.root, ownerKey);
    expect(outlet.getSnapshot().scenes).toHaveLength(1);
    const child = outlet.getSnapshot().scenes[0].getSnapshot().content as React.ReactElement<{
      children: React.ReactElement<{ runtime: RouteActivationRuntime<ModuleMetadata> }>;
    }>;
    expect(child.props.children.props.runtime).toBe(latest.tree.routes[1]);
  });
});
