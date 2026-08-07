import { describe, expect, it } from 'vitest';

import { Frame, FrameDefinition } from '../../../frame/declaration/frame';
import { Layout } from '../../../layout/declaration/layout';
import { Provider, RuntimeProviderInterface } from '../../../runtime/provider/runtime-provider';
import { RoutePolicyInterface } from '../../runtime/route-policy';
import { Router } from '../router';

import { Route } from './';

const loadModule = async (): Promise<Record<string, unknown>> => {
  return {};
};

describe('Route', () => {
  it('creates runtime id automatically', () => {
    const route = new Route({
      load: loadModule,
      path: 'home',
    });

    expect(route.runtimeId).toMatch(/^route:\d+$/);
  });

  it('creates unique runtime ids for different route instances', () => {
    const firstRoute = new Route({
      load: loadModule,
      path: 'home',
    });
    const secondRoute = new Route({
      load: loadModule,
      path: 'home',
    });

    expect(firstRoute.runtimeId).not.toBe(secondRoute.runtimeId);
  });

  it('keeps runtime ids stable when route instances are reordered', () => {
    const firstRoute = new Route({
      load: loadModule,
      path: 'first',
    });
    const secondRoute = new Route({
      load: loadModule,
      path: 'second',
    });
    const firstRouteId = firstRoute.runtimeId;
    const secondRouteId = secondRoute.runtimeId;
    const routes = [firstRoute, secondRoute];

    routes.reverse();

    expect(firstRoute.runtimeId).toBe(firstRouteId);
    expect(secondRoute.runtimeId).toBe(secondRouteId);
  });

  it('rejects empty child routes', () => {
    expect(() => {
      new Route({
        routes: [],
      });
    }).toThrow('Дочерние маршруты не могут быть пустыми.');
  });

  it('rejects empty path', () => {
    expect(() => {
      new Route({
        load: loadModule,
        path: '',
      });
    }).toThrow('Путь маршрута не может быть пустым.');
  });

  it('rejects empty default route target', () => {
    expect(() => {
      new Route({
        defaultTo: '',
        routes: [
          new Route({
            load: loadModule,
          }),
        ],
      });
    }).toThrow('defaultTo маршрута не может быть пустым.');
  });

  it('rejects default route target on module routes', () => {
    expect(() => {
      new Route({
        defaultTo: '/reports',
        load: loadModule,
      });
    }).toThrow('defaultTo маршрута можно использовать только в группах маршрутов.');
  });

  it('allows default route target on route groups', () => {
    const route = new Route({
      defaultTo: '/reports',
      routes: [
        new Route({
          load: loadModule,
          path: '/reports',
        }),
      ],
    });

    expect(route.defaultTo).toBe('/reports');
  });

  it('allows first available default route target on route groups', () => {
    const route = new Route({
      defaultTo: Router.firstAvailable(),
      routes: [
        new Route({
          load: loadModule,
          path: '/reports',
        }),
      ],
    });

    expect(route.defaultTo).toEqual({
      type: 'first-available',
    });
  });

  it('rejects default route target with index child route', () => {
    expect(() => {
      new Route({
        defaultTo: '/reports',
        routes: [
          new Route({
            load: loadModule,
          }),
        ],
      });
    }).toThrow('Маршрут не может одновременно определять defaultTo и индексный дочерний маршрут.');
  });

  it('rejects duplicate child paths', () => {
    expect(() => {
      new Route({
        routes: [
          new Route({
            load: loadModule,
            path: '/reports',
          }),
          new Route({
            load: loadModule,
            path: 'reports/',
          }),
        ],
      });
    }).toThrow('Дочерние маршруты не могут определять дублирующийся путь: reports/.');
  });

  it('rejects duplicate child index routes', () => {
    expect(() => {
      new Route({
        routes: [
          new Route({
            load: loadModule,
          }),
          new Route({
            load: loadModule,
          }),
        ],
      });
    }).toThrow('Дочерние маршруты не могут определять дублирующиеся индексные маршруты.');
  });

  it('allows pathless layout and one index child route', () => {
    const route = new Route({
      routes: [
        new Route({
          routes: [
            new Route({
              load: loadModule,
            }),
          ],
        }),
      ],
    });

    expect(route.routes).toHaveLength(1);
  });

  it('allows action policies on branch routes', () => {
    const route = new Route({
      canAction: [TestPolicy],
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    expect(route.canAction).toEqual([TestPolicy]);
  });

  it('allows layouts on module routes', () => {
    const route = new Route({
      layouts: [TestLayout],
      load: loadModule,
    });

    expect(route.layouts).toEqual([TestLayout]);
  });

  it('allows frames on route boundaries', () => {
    const route = new Route({
      frames: [TestFrame],
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    expect(route.frames).toEqual([TestFrame]);
  });

  it('allows providers on route boundaries', () => {
    const route = new Route({
      providers: [TestProvider],
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    expect(route.providers).toEqual([TestProvider]);
  });

  it('allows forbidden view on route boundaries', () => {
    const forbidden = 'Forbidden';
    const route = new Route({
      forbidden,
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    expect(route.forbidden).toBe(forbidden);
  });

  it('allows fallback view on route boundaries', () => {
    const fallback = 'Fallback';
    const route = new Route({
      fallback,
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    expect(route.fallback).toBe(fallback);
  });

  it('allows not found view on route boundaries', () => {
    const notFound = 'Not found';
    const route = new Route({
      notFound,
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    expect(route.notFound).toBe(notFound);
  });
});

class TestPolicy extends RoutePolicyInterface {
  execute(): { readonly type: 'pass' } {
    return { type: 'pass' };
  }
}

@Provider()
class TestProvider extends RuntimeProviderInterface {}

const TestLayoutView = (): null => {
  return null;
};

@Layout({
  view: TestLayoutView,
})
class TestLayout {}

const TestFrameView = (): null => {
  return null;
};

@Frame({
  view: TestFrameView,
})
class TestFrame extends FrameDefinition {}
