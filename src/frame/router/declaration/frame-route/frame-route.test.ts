import { describe, expect, it, vi } from 'vitest';

import { FrameRoute, getFrameRouteDefinition } from './frame-route.ts';

describe('FrameRoute', () => {
  it('stores a lazy index frame declaration', () => {
    const load = vi.fn(async () => ({}));
    const route = new FrameRoute({ load });

    expect(getFrameRouteDefinition(route)).toMatchObject({
      load,
      path: undefined,
      routes: [],
    });
  });

  it('stores a nested route group', () => {
    const child = new FrameRoute({ path: 'edit', load: async () => ({}) });
    const route = new FrameRoute({ path: 'settings', routes: [child] });

    expect(getFrameRouteDefinition(route).routes).toEqual([child]);
  });

  it('rejects a declaration with load and child routes', () => {
    expect(
      () =>
        new FrameRoute({
          load: async () => ({}),
          routes: [new FrameRoute({ load: async () => ({}) })],
        }),
    ).toThrow('FrameRoute должен определять либо load, либо routes.');
  });

  it('rejects duplicate child paths', () => {
    expect(
      () =>
        new FrameRoute({
          routes: [
            new FrameRoute({ path: 'edit', load: async () => ({}) }),
            new FrameRoute({ path: '/edit/', load: async () => ({}) }),
          ],
        }),
    ).toThrow('Дочерние frame-маршруты не могут определять дублирующийся путь: /edit/.');
  });

  it('rejects defaultTo together with an index frame', () => {
    expect(
      () =>
        new FrameRoute({
          defaultTo: 'review',
          routes: [new FrameRoute({ load: async () => ({}) })],
        }),
    ).toThrow('Frame-маршрут не может одновременно определять defaultTo и индексный дочерний маршрут.');
  });
});
