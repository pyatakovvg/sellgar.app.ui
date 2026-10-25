import { describe, expect, it } from 'vitest';

import { segments } from '../../declaration/address';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';

import { getRouterGraph } from './router-graph.ts';

describe('RouterGraph route index', () => {
  it('retains one route lookup for the cached graph, including nested Routers', () => {
    const frame = new Route({ address: segments('frame'), load: async () => ({}) });
    const nested = new Router({ routes: [frame] });
    const host = new Route({ address: segments('host'), load: async () => ({}), routing: [nested] });
    const router = new Router({ routes: [host] });
    const graph = getRouterGraph(router);

    expect(graph.nodesByRoute).toBeInstanceOf(Map);
    expect(graph.nodesByRoute.size).toBe(2);
    expect(graph.nodesByRoute.get(host)).toBe(graph.nodes[0]);
    expect(graph.nodesByRoute.get(frame)).toBe(graph.nodes[1]);
    expect(getRouterGraph(router).nodesByRoute).toBe(graph.nodesByRoute);
  });

  it('does not share the route lookup between different root Routers', () => {
    const first = new Route({ address: segments('first'), load: async () => ({}) });
    const second = new Route({ address: segments('second'), load: async () => ({}) });
    const firstGraph = getRouterGraph(new Router({ routes: [first] }));
    const secondGraph = getRouterGraph(new Router({ routes: [second] }));

    expect(firstGraph.nodesByRoute).not.toBe(secondGraph.nodesByRoute);
    expect(firstGraph.nodesByRoute.get(second)).toBeUndefined();
    expect(secondGraph.nodesByRoute.get(first)).toBeUndefined();
  });
});
