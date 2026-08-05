import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  RouteObject,
  ShouldRevalidateFunctionArgs,
} from 'react-router-dom';

import { Layout } from '../../../layout/declaration/layout';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import { RoutePolicyInterface } from '../../../router/runtime/route-policy';
import type { RoutePolicyDeclaration } from '../../../router/runtime/route-runtime-context';
import type { RouteRuntimeHandle } from '../../../router/runtime/router-runtime';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { Frame, FrameDefinition } from '../../../frame/declaration/frame';
import { Provider, RuntimeProviderInterface } from '../../../runtime/provider/runtime-provider';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ApplicationScope } from '../../../runtime/scope/kind';
import type { RuntimeScope } from '../../../runtime/scope/base';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';

import {
  createEmptyRoutePolicies,
  createRouteObjects,
  type RouteRuntimeAdapter,
  type RouteRuntimeFactory,
  type RouteRuntimeFactoryContext,
  type RouteRuntimeRegistry,
} from './route-object-builder.tsx';

describe('createRouteObjects', () => {
  it('creates module route objects with normalized path, loader and action', async () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      load: loadModule,
      path: '/reports',
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const routeObject = routeObjects[0];
    const routeRuntime = fixture.getRouteRuntime(route);

    expect(routeObject?.id).toBe(`root.${route.runtimeId}`);
    expect(routeObject?.path).toBe('reports');
    expect(routeObject?.loader).toBeTypeOf('function');
    expect(routeObject?.action).toBeTypeOf('function');
    expect(fixture.routerRuntime.registerMock).toHaveBeenCalledWith(
      `root.${route.runtimeId}`,
      routeRuntime,
      expect.objectContaining({
        frames: [],
        resolveException: expect.any(Function),
      }),
    );

    await invokeRouteLoader(routeObject, createLoaderArgs());
    await invokeRouteAction(routeObject, createActionArgs());

    expect(routeRuntime.loader).toHaveBeenCalledTimes(1);
    expect(routeRuntime.action).toHaveBeenCalledTimes(1);
  });

  it('creates automatic index route objects for pathless module routes', () => {
    const fixture = createBuilderFixture();
    const indexRoute = new Route({
      load: loadModule,
    });
    const rootRoute = new Route({
      path: '/dashboard',
      routes: [indexRoute],
    });

    const routeObjects = fixture.createRouteObjects([rootRoute]);
    const rootRouteObject = routeObjects[0];
    const indexRouteObject = rootRouteObject?.children?.[0];

    expect(indexRouteObject?.id).toBe(`root.${rootRoute.runtimeId}.${indexRoute.runtimeId}`);
    expect(indexRouteObject).toMatchObject({
      index: true,
    });
    expect(indexRouteObject?.loader).toBeTypeOf('function');
    expect(indexRouteObject?.action).toBeTypeOf('function');
  });

  it('skips route revalidation for hash-only navigation', () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      load: loadModule,
      path: '/home',
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const shouldRevalidate = invokeShouldRevalidate(routeObjects[0], {
      currentUrl: 'https://example.test/home#demo-info=%7B%22id%22%3A%221%22%7D',
      nextUrl: 'https://example.test/home',
    });

    expect(shouldRevalidate).toBe(false);
  });

  it('keeps default route revalidation for non hash-only navigation', () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      load: loadModule,
      path: '/home',
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const shouldRevalidatePath = invokeShouldRevalidate(routeObjects[0], {
      currentUrl: 'https://example.test/home#demo-info=true',
      nextUrl: 'https://example.test/reports#demo-info=true',
    });
    const shouldRevalidateSearch = invokeShouldRevalidate(routeObjects[0], {
      currentUrl: 'https://example.test/home?page=1#demo-info=true',
      nextUrl: 'https://example.test/home?page=2#demo-info=true',
    });
    const shouldRevalidateSameUrl = invokeShouldRevalidate(routeObjects[0], {
      currentUrl: 'https://example.test/home#demo-info=true',
      defaultShouldRevalidate: false,
      nextUrl: 'https://example.test/home#demo-info=true',
    });

    expect(shouldRevalidatePath).toBe(true);
    expect(shouldRevalidateSearch).toBe(true);
    expect(shouldRevalidateSameUrl).toBe(false);
  });

  it('revalidates default route groups when navigating to their pathname', () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      defaultTo: Router.firstAvailable(),
      routes: [
        new Route({
          load: loadModule,
          path: '/terminals',
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const shouldRevalidate = invokeShouldRevalidate(routeObjects[0], {
      currentUrl: 'https://example.test/terminals',
      defaultShouldRevalidate: false,
      nextUrl: 'https://example.test/',
    });

    expect(shouldRevalidate).toBe(true);
  });

  it('revalidates default route groups with base path when navigating to their pathname', () => {
    const fixture = createBuilderFixture({
      basePath: '/terminals-management',
    });
    const route = new Route({
      defaultTo: Router.firstAvailable(),
      routes: [
        new Route({
          load: loadModule,
          path: '/terminals',
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const shouldRevalidate = invokeShouldRevalidate(routeObjects[0], {
      currentUrl: 'https://example.test/terminals-management/terminals',
      defaultShouldRevalidate: false,
      nextUrl: 'https://example.test/terminals-management',
    });

    expect(shouldRevalidate).toBe(true);
  });

  it('adds branch loaders for route policies without module load', () => {
    const canMatch = createPolicyDeclaration();
    const canActivate = createPolicyDeclaration();
    const fixture = createBuilderFixture();
    const route = new Route({
      canActivate: [canActivate],
      canMatch: [canMatch],
      path: '/secure',
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const routeObject = routeObjects[0];
    const context = fixture.getFactoryContext(route);

    expect(routeObject?.loader).toBeTypeOf('function');
    expect(routeObject?.action).toBeUndefined();
    expect(context.loaderPolicies).toEqual({
      canAction: [],
      canActivate: [canActivate],
      canMatch: [canMatch],
    });
  });

  it('adds branch loaders for route providers without module load', () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      path: '/monitoring',
      providers: [TestProvider],
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([route]);

    expect(routeObjects[0]?.loader).toBeTypeOf('function');
  });

  it('adds branch loaders for layout providers without module load', () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      layouts: [ProviderLayout],
      path: '/monitoring',
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([route]);

    expect(routeObjects[0]?.loader).toBeTypeOf('function');
  });

  it('passes route pathname and base path to route runtime factory', () => {
    const fixture = createBuilderFixture({
      basePath: '/terminals-management',
    });
    const childRoute = new Route({
      load: loadModule,
      path: '/terminals',
    });
    const parentRoute = new Route({
      defaultTo: '/terminals',
      routes: [childRoute],
    });

    fixture.createRouteObjects([parentRoute]);

    expect(fixture.getFactoryContext(parentRoute)).toMatchObject({
      basePath: '/terminals-management',
      routePathname: '/',
    });
    expect(fixture.getFactoryContext(childRoute)).toMatchObject({
      basePath: '/terminals-management',
      routePathname: '/terminals',
    });
  });

  it('creates internal index match for default route groups', () => {
    const fixture = createBuilderFixture();
    const route = new Route({
      defaultTo: '/terminals',
      routes: [
        new Route({
          load: loadModule,
          path: '/terminals',
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([route]);
    const defaultIndexRouteObject = routeObjects[0]?.children?.[0];

    expect(defaultIndexRouteObject).toMatchObject({
      element: null,
      index: true,
    });
    expect(defaultIndexRouteObject?.loader).toBeUndefined();
  });

  it('inherits loader policies for route providers', () => {
    const canMatch = createPolicyDeclaration();
    const fixture = createBuilderFixture();
    const childRoute = new Route({
      path: '/monitoring',
      providers: [TestProvider],
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });
    const parentRoute = new Route({
      canMatch: [canMatch],
      routes: [childRoute],
    });

    fixture.createRouteObjects([parentRoute]);

    expect(fixture.getFactoryContext(childRoute).loaderPolicies.canMatch).toEqual([canMatch]);
  });

  it('inherits canAction, canActivate and canMatch policies to module routes', () => {
    const parentCanAction = createPolicyDeclaration();
    const parentCanActivate = createPolicyDeclaration();
    const parentCanMatch = createPolicyDeclaration();
    const childCanAction = createPolicyDeclaration();
    const childCanActivate = createPolicyDeclaration();
    const childCanMatch = createPolicyDeclaration();
    const fixture = createBuilderFixture();
    const childRoute = new Route({
      canAction: [childCanAction],
      canActivate: [childCanActivate],
      canMatch: [childCanMatch],
      load: loadModule,
      path: '/details',
    });
    const parentRoute = new Route({
      canAction: [parentCanAction],
      canActivate: [parentCanActivate],
      canMatch: [parentCanMatch],
      path: '/reports',
      routes: [childRoute],
    });

    fixture.createRouteObjects([parentRoute]);

    const context = fixture.getFactoryContext(childRoute);

    expect(context.loaderPolicies).toEqual({
      canAction: [parentCanAction, childCanAction],
      canActivate: [parentCanActivate, childCanActivate],
      canMatch: [parentCanMatch, childCanMatch],
    });
    expect(context.actionPolicies).toEqual(context.loaderPolicies);
  });

  it('inherits route frames to child route runtime availability', () => {
    const fixture = createBuilderFixture();
    const childRoute = new Route({
      frames: [ChildFrame],
      load: loadModule,
      path: '/details',
    });
    const parentRoute = new Route({
      frames: [ParentFrame],
      path: '/reports',
      routes: [childRoute],
    });

    fixture.createRouteObjects([parentRoute]);

    const parentContext = fixture.getFactoryContext(parentRoute);
    const childContext = fixture.getFactoryContext(childRoute);

    expect(parentContext.availableFrames).toEqual([ParentFrame]);
    expect(childContext.availableFrames).toEqual([ParentFrame, ChildFrame]);
    expect(fixture.routerRuntime.registerMock).toHaveBeenCalledWith(
      `root.${parentRoute.runtimeId}`,
      fixture.getRouteRuntime(parentRoute),
      expect.objectContaining({
        frames: [ParentFrame],
        resolveException: expect.any(Function),
      }),
    );
    expect(fixture.routerRuntime.registerMock).toHaveBeenCalledWith(
      `root.${parentRoute.runtimeId}.${childRoute.runtimeId}`,
      fixture.getRouteRuntime(childRoute),
      expect.objectContaining({
        frames: [ParentFrame, ChildFrame],
        resolveException: expect.any(Function),
      }),
    );
  });

  it('deduplicates inherited route frames', () => {
    const fixture = createBuilderFixture();
    const childRoute = new Route({
      frames: [ParentFrame],
      load: loadModule,
      path: '/details',
    });
    const parentRoute = new Route({
      frames: [ParentFrame],
      path: '/reports',
      routes: [childRoute],
    });

    fixture.createRouteObjects([parentRoute]);

    expect(fixture.getFactoryContext(childRoute).availableFrames).toEqual([ParentFrame]);
  });

  it('passes nearest inherited exception to child route error elements', () => {
    const parentException = <div>Parent exception</div>;
    const childException = <div>Child exception</div>;
    const fixture = createBuilderFixture();
    const inheritedChildRoute = new Route({
      load: loadModule,
      path: '/inherited',
    });
    const ownChildRoute = new Route({
      exception: childException,
      load: loadModule,
      path: '/own',
    });
    const parentRoute = new Route({
      exception: parentException,
      path: '/reports',
      routes: [inheritedChildRoute, ownChildRoute],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const children = routeObjects[0]?.children ?? [];

    expect(getErrorElementException(children[0])).toBe(parentException);
    expect(getErrorElementException(children[1])).toBe(childException);
  });

  it('passes nearest inherited forbidden view to child route error elements', () => {
    const parentForbidden = <div>Parent forbidden</div>;
    const childForbidden = <div>Child forbidden</div>;
    const fixture = createBuilderFixture();
    const inheritedChildRoute = new Route({
      load: loadModule,
      path: '/inherited',
    });
    const ownChildRoute = new Route({
      forbidden: childForbidden,
      load: loadModule,
      path: '/own',
    });
    const parentRoute = new Route({
      forbidden: parentForbidden,
      path: '/reports',
      routes: [inheritedChildRoute, ownChildRoute],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const children = routeObjects[0]?.children ?? [];

    expect(getErrorElementForbidden(children[0])).toBe(parentForbidden);
    expect(getErrorElementForbidden(children[1])).toBe(childForbidden);
  });

  it('passes route fallback view to branch pending boundaries', () => {
    const parentFallback = <div>Parent fallback</div>;
    const childFallback = <div>Child fallback</div>;
    const fixture = createBuilderFixture();
    const nestedBranchRoute = new Route({
      fallback: childFallback,
      path: '/nested',
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });
    const parentRoute = new Route({
      fallback: parentFallback,
      path: '/reports',
      routes: [nestedBranchRoute],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);

    expect(getRoutePendingBoundaryFallback(routeObjects[0])).toBe(parentFallback);
    expect(getRoutePendingBoundaryFallback(routeObjects[0]?.children?.[0])).toBe(childFallback);
  });

  it('passes nearest inherited not found view to child route error elements', () => {
    const parentNotFound = <div>Parent not found</div>;
    const childNotFound = <div>Child not found</div>;
    const fixture = createBuilderFixture();
    const inheritedChildRoute = new Route({
      load: loadModule,
      path: '/inherited',
    });
    const ownChildRoute = new Route({
      load: loadModule,
      notFound: childNotFound,
      path: '/own',
    });
    const parentRoute = new Route({
      notFound: parentNotFound,
      path: '/reports',
      routes: [inheritedChildRoute, ownChildRoute],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const children = routeObjects[0]?.children ?? [];
    const inheritedChildRouteObject = children.find((routeObject) => {
      return routeObject.path === 'inherited';
    });
    const ownChildRouteObject = children.find((routeObject) => {
      return routeObject.path === 'own';
    });

    expect(getErrorElementNotFound(inheritedChildRouteObject)).toBe(parentNotFound);
    expect(getErrorElementNotFound(ownChildRouteObject)).toBe(childNotFound);
  });

  it('creates internal not found route for route branches with notFound view', async () => {
    const notFound = <div>Branch not found</div>;
    const fixture = createBuilderFixture();
    const parentRoute = new Route({
      notFound,
      path: '/reports',
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const notFoundRouteObject = routeObjects[0]?.children?.at(-1);

    expect(notFoundRouteObject?.path).toBe('*');
    expect(getErrorElementNotFound(notFoundRouteObject)).toBe(notFound);
    await expect(invokeRouteLoader(notFoundRouteObject, createLoaderArgs())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('creates internal not found route for path branches with inherited notFound view', async () => {
    const notFound = <div>Inherited not found</div>;
    const fixture = createBuilderFixture({
      notFound,
    });
    const parentRoute = new Route({
      path: '/reports',
      routes: [
        new Route({
          load: loadModule,
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const notFoundRouteObject = routeObjects[0]?.children?.at(-1);

    expect(notFoundRouteObject?.path).toBe('*');
    expect(getErrorElementNotFound(notFoundRouteObject)).toBe(notFound);
    await expect(invokeRouteLoader(notFoundRouteObject, createLoaderArgs())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('creates leaf not found routes for extra segments after path module routes', async () => {
    const notFound = <div>Inherited not found</div>;
    const fixture = createBuilderFixture({
      notFound,
    });
    const parentRoute = new Route({
      path: '/reports',
      routes: [
        new Route({
          load: loadModule,
          path: '/items',
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const leafNotFoundRouteObject = routeObjects[0]?.children?.[1];
    const matches = matchRoutes(
      [
        {
          path: '/',
          children: routeObjects,
        },
      ],
      '/reports/items/unknown',
    );
    expect(leafNotFoundRouteObject?.path).toBe('items/*');
    expect(matches?.at(-1)?.route.path).toBe('items/*');
    expect(getErrorElementNotFound(leafNotFoundRouteObject)).toBe(notFound);
    await expect(invokeRouteLoader(leafNotFoundRouteObject, createLoaderArgs())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('does not create internal not found route for pathless branches with inherited notFound view', () => {
    const fixture = createBuilderFixture({
      notFound: <div>Inherited not found</div>,
    });
    const parentRoute = new Route({
      routes: [
        new Route({
          load: loadModule,
          path: '/reports',
        }),
      ],
    });

    const routeObjects = fixture.createRouteObjects([parentRoute]);
    const hasNotFoundRoute = routeObjects[0]?.children?.some((routeObject) => {
      return routeObject.path === '*';
    });

    expect(hasNotFoundRoute).toBe(false);
  });

  it('renders layouts on group and module routes', () => {
    const fixture = createBuilderFixture();
    const moduleRoute = new Route({
      layouts: [ModuleLayout],
      load: loadModule,
      path: '/home',
    });
    const groupRoute = new Route({
      layouts: [GroupLayout],
      path: '/workspace',
      routes: [moduleRoute],
    });

    const routeObjects = fixture.createRouteObjects([groupRoute]);
    const groupElement = getRouteContentElement(routeObjects[0]?.element);
    const moduleElement = getRouteContentElement(routeObjects[0]?.children?.[0]?.element);

    expect(React.isValidElement(groupElement)).toBe(true);
    expect(React.isValidElement(moduleElement)).toBe(true);
    expect((groupElement as React.ReactElement).type).toBe(GroupLayoutView);
    expect((moduleElement as React.ReactElement).type).toBe(ModuleLayoutView);
    expect(getLayoutChild(groupElement).props.fallback).toBeDefined();
    expect(getLayoutChild(moduleElement).props.moduleRuntime).toBeDefined();
  });
});

const loadModule = async (): Promise<Record<string, unknown>> => {
  return {};
};

class TestPolicy extends RoutePolicyInterface {
  execute() {
    return {
      type: 'pass' as const,
    };
  }
}

@Provider()
class TestProvider extends RuntimeProviderInterface {}

const ProviderLayoutView: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <section>{children}</section>;
};

class ProviderLayout {}
Layout({
  providers: [TestProvider],
  view: ProviderLayoutView,
})(ProviderLayout);

const createPolicyDeclaration = (): RoutePolicyDeclaration => {
  return {
    use: TestPolicy,
  };
};

const GroupLayoutView: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <section>{children}</section>;
};

const ModuleLayoutView: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <article>{children}</article>;
};

class GroupLayout {}
Layout({ view: GroupLayoutView })(GroupLayout);

class ModuleLayout {}
Layout({ view: ModuleLayoutView })(ModuleLayout);

const ParentFrameView = (): null => {
  return null;
};

const ChildFrameView = (): null => {
  return null;
};

@Frame({
  view: ParentFrameView,
})
class ParentFrame extends FrameDefinition {}

@Frame({
  view: ChildFrameView,
})
class ChildFrame extends FrameDefinition {}

interface BuilderFixture {
  readonly createRouteObjects: (routes: readonly Route[]) => RouteObject[];
  readonly getFactoryContext: (route: Route) => RouteRuntimeFactoryContext;
  readonly getRouteRuntime: (route: Route) => TestRouteRuntimeAdapter;
  readonly routerRuntime: TestRouteRuntimeRegistry;
}

interface BuilderFixtureOptions {
  readonly basePath?: string;
  readonly notFound?: React.ReactNode;
}

const createBuilderFixture = (options: BuilderFixtureOptions = {}): BuilderFixture => {
  const contexts = new Map<Route, RouteRuntimeFactoryContext>();
  const routeRuntimes = new Map<Route, TestRouteRuntimeAdapter>();
  const routerRuntime = new TestRouteRuntimeRegistry();
  const routeRuntimeFactory: RouteRuntimeFactory = (context) => {
    const routeRuntime = new TestRouteRuntimeAdapter();

    contexts.set(context.route, context);
    routeRuntimes.set(context.route, routeRuntime);

    return routeRuntime;
  };

  return {
    createRouteObjects: (routes) => {
      return createRouteObjects({
        app: {} as ApplicationControllerInterface,
        applicationScope: {} as ApplicationScope,
        components: createApplicationComponents(),
        inheritedException: null,
        inheritedFallback: null,
        inheritedForbidden: null,
        inheritedFrames: [],
        inheritedNotFound: options.notFound,
        inheritedPolicies: createEmptyRoutePolicies(),
        basePath: options.basePath,
        parentKey: 'root',
        routeRuntimeFactory,
        routerRuntime,
        routes,
        session: {} as SessionRuntimeStateInterface,
      });
    },
    getFactoryContext: (route) => {
      const context = contexts.get(route);

      if (context === undefined) {
        throw new Error('Контекст фабрики runtime маршрута не найден.');
      }

      return context;
    },
    getRouteRuntime: (route) => {
      const routeRuntime = routeRuntimes.get(route);

      if (routeRuntime === undefined) {
        throw new Error('Runtime маршрута не найден.');
      }

      return routeRuntime;
    },
    routerRuntime,
  };
};

const createApplicationComponents = (): ApplicationComponents => {
  return {
    exception: <div>Application exception</div>,
    fallback: <div>Fallback</div>,
    forbidden: <div>Forbidden</div>,
    notFound: <div>Not found</div>,
    splash: <div>Splash</div>,
  };
};

class TestRouteRuntimeRegistry implements RouteRuntimeRegistry {
  readonly registerMock = vi.fn();

  register(
    routeId: string,
    routeRuntime: RouteRuntimeHandle,
    options?: {
      readonly exception?: React.ReactNode;
      readonly forbidden?: React.ReactNode;
      readonly frames?: readonly unknown[];
      readonly resolveException?: () => React.ReactNode;
    },
  ): void {
    this.registerMock(routeId, routeRuntime, options);
  }
}

class TestRouteRuntimeAdapter implements RouteRuntimeAdapter {
  readonly action = vi.fn(async () => {
    return null;
  });
  readonly commit = vi.fn();
  readonly discardPending = vi.fn();
  readonly dispose = vi.fn(async () => {});
  readonly getException = vi.fn((exception?: React.ReactNode) => {
    return exception;
  });
  readonly getPreparedFrameRuntime = vi.fn(() => null);
  readonly prepareFrameRuntime = vi.fn((): never => {
    throw new Error('Неожиданная подготовка runtime фрейма.');
  });
  readonly getModuleRuntime = vi.fn(() => {
    return {
      getViewModuleOrNull: () => null,
    } as unknown as ModuleRuntime;
  });
  readonly getRuntimeScope = vi.fn(() => {
    return {} as RuntimeScope;
  });
  readonly getRouteScope = vi.fn(() => {
    return {} as RuntimeScope;
  });
  readonly loader = vi.fn(async () => {
    return null;
  });
}

const createLoaderArgs = (): LoaderFunctionArgs => {
  const url = new URL('https://example.test');

  return {
    context: {},
    params: {},
    pattern: '/',
    request: new Request(url),
    url,
  };
};

const createActionArgs = (): ActionFunctionArgs => {
  const url = new URL('https://example.test');

  return {
    context: {},
    params: {},
    pattern: '/',
    request: new Request(url, {
      method: 'post',
    }),
    url,
  };
};

const invokeRouteLoader = async (routeObject: RouteObject | undefined, args: LoaderFunctionArgs): Promise<unknown> => {
  if (typeof routeObject?.loader !== 'function') {
    throw new Error('Loader маршрута не является вызываемым.');
  }

  return routeObject.loader(args);
};

const invokeRouteAction = async (routeObject: RouteObject | undefined, args: ActionFunctionArgs): Promise<unknown> => {
  if (typeof routeObject?.action !== 'function') {
    throw new Error('Action маршрута не является вызываемым.');
  }

  return routeObject.action(args);
};

interface ShouldRevalidateTestOptions {
  readonly currentUrl: string;
  readonly defaultShouldRevalidate?: boolean;
  readonly nextUrl: string;
}

const invokeShouldRevalidate = (
  routeObject: RouteObject | undefined,
  options: ShouldRevalidateTestOptions,
): boolean => {
  if (typeof routeObject?.shouldRevalidate !== 'function') {
    throw new Error('shouldRevalidate маршрута не является вызываемым.');
  }

  return routeObject.shouldRevalidate(createShouldRevalidateArgs(options));
};

const createShouldRevalidateArgs = (options: ShouldRevalidateTestOptions): ShouldRevalidateFunctionArgs => {
  return {
    actionResult: undefined,
    currentParams: {},
    currentUrl: new URL(options.currentUrl),
    defaultShouldRevalidate: options.defaultShouldRevalidate ?? true,
    formAction: undefined,
    formData: undefined,
    formEncType: undefined,
    formMethod: undefined,
    json: undefined,
    nextParams: {},
    nextUrl: new URL(options.nextUrl),
    text: undefined,
  };
};

const getErrorElementException = (routeObject: RouteObject | undefined): React.ReactNode => {
  if (!React.isValidElement(routeObject?.errorElement)) {
    throw new Error('Error element маршрута некорректен.');
  }

  return (
    routeObject.errorElement as React.ReactElement<{
      readonly exception: React.ReactNode;
    }>
  ).props.exception;
};

const getErrorElementForbidden = (routeObject: RouteObject | undefined): React.ReactNode => {
  if (!React.isValidElement(routeObject?.errorElement)) {
    throw new Error('Error element маршрута некорректен.');
  }

  return (
    routeObject.errorElement as React.ReactElement<{
      readonly forbidden: React.ReactNode;
    }>
  ).props.forbidden;
};

const getErrorElementNotFound = (routeObject: RouteObject | undefined): React.ReactNode => {
  if (!React.isValidElement(routeObject?.errorElement)) {
    throw new Error('Error element маршрута некорректен.');
  }

  return (
    routeObject.errorElement as React.ReactElement<{
      readonly notFound: React.ReactNode;
    }>
  ).props.notFound;
};

const getRoutePendingBoundaryFallback = (routeObject: RouteObject | undefined): React.ReactNode => {
  if (!React.isValidElement(routeObject?.element)) {
    throw new Error('Element маршрута некорректен.');
  }

  const element = getRouteContentElement(routeObject.element);

  return (
    element as React.ReactElement<{
      readonly fallback: React.ReactNode;
    }>
  ).props.fallback;
};

const getRouteContentElement = (element: React.ReactNode): React.ReactNode => {
  if (!React.isValidElement<{ readonly children: React.ReactNode }>(element)) {
    return element;
  }

  if (element.type !== RuntimeScopeProvider) {
    return element;
  }

  return element.props.children;
};

const getLayoutChild = (
  element: React.ReactNode,
): React.ReactElement<{
  readonly fallback: React.ReactNode;
  readonly moduleRuntime: ModuleRuntime;
}> => {
  if (!React.isValidElement<{ readonly children: React.ReactNode }>(element)) {
    throw new Error('Layout element маршрута некорректен.');
  }

  const child = element.props.children;

  if (!React.isValidElement<{ readonly fallback: React.ReactNode; readonly moduleRuntime: ModuleRuntime }>(child)) {
    throw new Error('Дочерний layout маршрута некорректен.');
  }

  return child;
};
