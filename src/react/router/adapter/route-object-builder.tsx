import React from 'react';
import {
  Outlet,
  redirect,
  replace,
  type LoaderFunctionArgs,
  type RouteObject,
  type ShouldRevalidateFunctionArgs,
} from 'react-router';

import { getLayoutMetadata } from '../../../layout/declaration/layout';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { FrameRouter } from '../../../frame/router/declaration';
import { getRouteDefinition, type Route } from '../../../router/declaration/route';
import {
  isRouteRuntimeNavigationException,
  RouteRuntime,
  type RouteRuntimeLoadContext,
} from '../../../router/runtime/route-runtime';
import type { RoutePolicyDeclarations } from '../../../router/runtime/route-runtime-context';
import type { RouteRuntimeHandle } from '../../../router/runtime/router-runtime';
import { createRoutePathname } from '../../../router/utils/route-pathname';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ApplicationScope } from '../../../runtime/scope/kind';
import type { RuntimeScope } from '../../../runtime/scope/base';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';
import type { ControllerRuntimeContextValue } from '../../../controller/react/controller-runtime-context';
import { parseHashToObject } from '../../../router/utils/hash-utils';
import { parseSearchParams } from '../../../router/utils/search-utils';

import { RouteExceptionBoundary } from '../exception';
import { LazyModuleView } from '../module';
import { RoutePendingBoundary } from '../pending';

export interface RouteObjectBuilderOptions {
  readonly app: ApplicationControllerInterface;
  readonly applicationScope: ApplicationScope;
  readonly appendNotFoundRoute?: boolean;
  readonly basePath?: string;
  readonly components: ApplicationComponents;
  readonly inheritedException: React.ReactNode;
  readonly inheritedFallback: React.ReactNode;
  readonly inheritedForbidden: React.ReactNode;
  readonly inheritedNotFound: React.ReactNode;
  readonly inheritedPolicies: RoutePolicyDeclarations;
  readonly parentPathname?: string;
  readonly parentKey: string;
  readonly routeRuntimeFactory?: RouteRuntimeFactory;
  readonly routerRuntime: RouteRuntimeRegistry;
  readonly routes: readonly Route[];
  readonly session: SessionRuntimeStateInterface;
}

export interface RouteRuntimeFactoryContext {
  readonly actionPolicies: RoutePolicyDeclarations;
  readonly app: ApplicationControllerInterface;
  readonly applicationScope: ApplicationScope;
  readonly loaderPolicies: RoutePolicyDeclarations;
  readonly basePath?: string;
  readonly route: Route;
  readonly routeId: string;
  readonly routePathname: string;
  readonly session: SessionRuntimeStateInterface;
}

export type RouteRuntimeFactory = (context: RouteRuntimeFactoryContext) => RouteRuntimeAdapter;

export interface RouteRuntimeAdapter extends RouteRuntimeHandle, ControllerRuntimeContextValue {
  getException(inheritedException?: React.ReactNode): React.ReactNode;
  getModuleRuntime(): ModuleRuntime;
  getRouteScope(): RuntimeScope;
  loader(context: RouteRuntimeLoadContext): Promise<unknown>;
}

export interface RouteRuntimeRegistry {
  register(
    routeId: string,
    routeRuntime: RouteRuntimeHandle,
    options?: {
      readonly frames?: readonly FrameRouter[];
    },
  ): void;
  trackRouteActivation(
    routeId: string,
    navigationKey: string,
  ): {
    activate(): void;
    complete(): void;
  };
}

export const createRouteObjects = (options: RouteObjectBuilderOptions): RouteObject[] => {
  const routeRuntimeFactory = options.routeRuntimeFactory ?? createDefaultRouteRuntime;
  const routeObjects = options.routes.flatMap((route) => {
    const routeObject = createRouteObject(options, route, routeRuntimeFactory);
    const notFoundRouteObject = createLeafNotFoundRouteObject(options, route);

    return notFoundRouteObject ? [routeObject, notFoundRouteObject] : [routeObject];
  });

  if (shouldAppendNotFoundRoute(options)) {
    routeObjects.push(
      createNotFoundRouteObject(options.inheritedException, options.inheritedForbidden, options.inheritedNotFound),
    );
  }

  return routeObjects;
};

const createRouteObject = (
  options: RouteObjectBuilderOptions,
  route: Route,
  routeRuntimeFactory: RouteRuntimeFactory,
): RouteObject => {
  const definition = getRouteDefinition(route);
  const routeKey = createRouteKey(route, options.parentKey);
  const routePathname = createRoutePathname(options.parentPathname, definition.path);
  const policies = mergeRoutePolicies(options.inheritedPolicies, route);
  const loaderPolicies = shouldInheritLoaderPolicies(route) ? policies : createRoutePolicies(route);
  const routeRuntime = routeRuntimeFactory({
    actionPolicies: policies,
    app: options.app,
    applicationScope: options.applicationScope,
    basePath: options.basePath,
    loaderPolicies,
    route,
    routeId: routeKey,
    routePathname,
    session: options.session,
  });

  const routeException = definition.exception ?? options.inheritedException;
  const routeFallback = definition.fallback ?? options.inheritedFallback;
  const routeForbidden = definition.forbidden ?? options.inheritedForbidden;
  const routeNotFound = definition.notFound ?? options.inheritedNotFound;
  const element = renderRouteElement(route, options.basePath, routeFallback, routeKey, routePathname, routeRuntime);
  const handlesLoader = shouldHandleRouteLoader(route);

  options.routerRuntime.register(routeKey, routeRuntime, {
    frames: definition.frames,
  });

  if (isIndexRoute(route)) {
    return {
      id: routeKey,
      index: true,
      element,
      errorElement: (
        <RouteExceptionBoundary
          exception={routeException}
          forbidden={routeForbidden}
          notFound={routeNotFound}
          routeRuntime={routeRuntime}
        />
      ),
      loader: handlesLoader
        ? (args) => invokeRouteLoader(routeKey, routeRuntime, options.routerRuntime, args, options.basePath)
        : undefined,
      shouldRevalidate: createRouteShouldRevalidate(route, options.basePath, routePathname),
    };
  }

  return {
    id: routeKey,
    path: normalizeRoutePath(definition.path),
    element,
    errorElement: (
      <RouteExceptionBoundary
        exception={routeException}
        forbidden={routeForbidden}
        notFound={routeNotFound}
        routeRuntime={routeRuntime}
      />
    ),
    loader: handlesLoader
      ? (args) => invokeRouteLoader(routeKey, routeRuntime, options.routerRuntime, args, options.basePath)
      : undefined,
    shouldRevalidate: createRouteShouldRevalidate(route, options.basePath, routePathname),
    children: createRouteChildren({
      ...options,
      inheritedException: routeException,
      inheritedFallback: routeFallback,
      inheritedForbidden: routeForbidden,
      inheritedNotFound: routeNotFound,
      inheritedPolicies: policies,
      appendNotFoundRoute: shouldAppendBranchNotFoundRoute(route, routeNotFound),
      parentPathname: routePathname,
      parentKey: routeKey,
      route,
      routeRuntimeFactory,
      routes: definition.routes,
    }),
  };
};

const createRouteChildren = (options: RouteObjectBuilderOptions & { readonly route: Route }): RouteObject[] => {
  const children = createRouteObjects(options);

  if (getRouteDefinition(options.route).defaultTo === undefined) {
    return children;
  }

  return [
    {
      index: true,
      element: null,
    },
    ...children,
  ];
};

export const createEmptyRoutePolicies = (): RoutePolicyDeclarations => {
  return {
    canAction: [],
    canActivate: [],
    canMatch: [],
  };
};

const createDefaultRouteRuntime: RouteRuntimeFactory = (context) => {
  return new RouteRuntime(
    context.route,
    context.app,
    context.session,
    context.applicationScope,
    context.loaderPolicies,
    context.actionPolicies,
    context.routePathname,
    context.basePath,
    context.routeId,
  );
};

const invokeRouteLoader = async (
  routeKey: string,
  routeRuntime: RouteRuntimeAdapter,
  routerRuntime: RouteRuntimeRegistry,
  args: LoaderFunctionArgs,
  basePath: string | undefined,
): Promise<unknown> => {
  const context = createRouteRuntimeLoadContext(args, basePath);
  const activation = routerRuntime.trackRouteActivation(routeKey, context.location.key);

  try {
    return await routeRuntime.loader({
      ...context,
      activate: activation.activate,
    });
  } catch (error) {
    return applyRouteRuntimeNavigation(error);
  } finally {
    activation.complete();
  }
};

export const createRouteRuntimeLoadContext = (
  args: LoaderFunctionArgs,
  basePath: string | undefined,
): RouteRuntimeLoadContext => {
  const url = new URL(args.request.url);
  const hash = url.hash || getBrowserLocationHash();

  return {
    location: {
      hash,
      hashParams: parseHashToObject(hash),
      key: args.request.url,
      params: args.params,
      pathname: removeBasePath(url.pathname, basePath),
      search: url.search,
      searchParams: parseSearchParams(url.search),
      state: null,
    },
    signal: args.request.signal,
  };
};

const applyRouteRuntimeNavigation = (error: unknown): never => {
  if (!isRouteRuntimeNavigationException(error)) {
    throw error;
  }

  switch (error.decision.type) {
    case 'redirect':
      throw error.decision.replace ? replace(error.decision.to) : redirect(error.decision.to);
    case 'forbidden':
      throw new Response(null, { status: 403 });
    case 'not-found':
      throw new Response(null, { status: 404 });
  }
};

const getBrowserLocationHash = (): string => {
  if (typeof globalThis.location?.hash !== 'string') {
    return '';
  }

  return globalThis.location.hash;
};

const isIndexRoute = (route: Route): boolean => {
  const definition = getRouteDefinition(route);

  return definition.path === undefined && definition.routes.length === 0;
};

const shouldHandleRouteLoader = (route: Route): boolean => {
  const definition = getRouteDefinition(route);

  return (
    definition.defaultTo !== undefined ||
    definition.load !== undefined ||
    hasRuntimeProviders(route) ||
    definition.canMatch.length > 0 ||
    definition.canActivate.length > 0
  );
};

const shouldInheritLoaderPolicies = (route: Route): boolean => {
  return getRouteDefinition(route).load !== undefined || hasRuntimeProviders(route);
};

const hasRuntimeProviders = (route: Route): boolean => {
  const definition = getRouteDefinition(route);

  return (
    definition.providers.length > 0 ||
    definition.layouts.some((layout) => {
      return (getLayoutMetadata(layout).providers?.length ?? 0) > 0;
    })
  );
};

const shouldAppendNotFoundRoute = (options: RouteObjectBuilderOptions): boolean => {
  return (
    options.appendNotFoundRoute === true &&
    options.inheritedNotFound !== undefined &&
    !options.routes.some((route) => getRouteDefinition(route).path === '*')
  );
};

const shouldAppendBranchNotFoundRoute = (route: Route, notFound: React.ReactNode | undefined): boolean => {
  const definition = getRouteDefinition(route);

  if (definition.load !== undefined) {
    return false;
  }

  return definition.notFound !== undefined || (definition.path !== undefined && notFound !== undefined);
};

const createLeafNotFoundRouteObject = (options: RouteObjectBuilderOptions, route: Route): RouteObject | null => {
  const definition = getRouteDefinition(route);
  const notFound = definition.notFound ?? options.inheritedNotFound;
  const routePath = normalizeRoutePath(definition.path);

  if (
    definition.load === undefined ||
    routePath === undefined ||
    routePath === '*' ||
    routePath.endsWith('/*') ||
    notFound === undefined ||
    options.routes.some((sibling) => normalizeRoutePath(getRouteDefinition(sibling).path) === `${routePath}/*`)
  ) {
    return null;
  }

  return createNotFoundRouteObject(
    definition.exception ?? options.inheritedException,
    definition.forbidden ?? options.inheritedForbidden,
    notFound,
    `${routePath}/*`,
  );
};

const createNotFoundRouteObject = (
  exception: React.ReactNode,
  forbidden: React.ReactNode,
  notFound: React.ReactNode,
  path = '*',
): RouteObject => {
  return {
    path,
    element: null,
    errorElement: <RouteExceptionBoundary exception={exception} forbidden={forbidden} notFound={notFound} />,
    loader: () => {
      throw new Response(null, { status: 404 });
    },
  };
};

const createRouteShouldRevalidate = (
  route: Route,
  basePath: string | undefined,
  routePathname: string,
): ((args: ShouldRevalidateFunctionArgs) => boolean) => {
  const definition = getRouteDefinition(route);

  return (args) => {
    if (isHashOnlyNavigation(args.currentUrl, args.nextUrl)) {
      return false;
    }

    if (definition.defaultTo !== undefined && isRoutePathnameRequest(args.nextUrl, basePath, routePathname)) {
      return true;
    }

    return args.defaultShouldRevalidate;
  };
};

const isRoutePathnameRequest = (url: URL, basePath: string | undefined, routePathname: string): boolean => {
  const pathname = removeBasePath(url.pathname, basePath);

  return normalizePathname(pathname) === normalizePathname(routePathname);
};

const removeBasePath = (pathname: string, basePath: string | undefined): string => {
  if (!basePath || basePath === '/') {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return pathname;
};

const isHashOnlyNavigation = (currentUrl: URL, nextUrl: URL): boolean => {
  return (
    currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search && currentUrl.hash !== nextUrl.hash
  );
};

const normalizeRoutePath = (path: string | undefined): string | undefined => {
  return path?.replace(/^\//, '');
};

const normalizePathname = (pathname: string): string => {
  const normalizedPathname = `/${pathname}`.replace(/\/+/g, '/').replace(/\/$/, '');

  return normalizedPathname === '' ? '/' : normalizedPathname;
};

const createRouteKey = (route: Route, parentKey: string): string => {
  return `${parentKey}.${getRouteDefinition(route).runtimeId}`;
};

const createRoutePolicies = (route: Route): RoutePolicyDeclarations => {
  const definition = getRouteDefinition(route);

  return {
    canAction: [],
    canActivate: definition.canActivate,
    canMatch: definition.canMatch,
  };
};

const mergeRoutePolicies = (inheritedPolicies: RoutePolicyDeclarations, route: Route): RoutePolicyDeclarations => {
  const definition = getRouteDefinition(route);

  return {
    canAction: [...inheritedPolicies.canAction, ...definition.canAction],
    canActivate: [...inheritedPolicies.canActivate, ...definition.canActivate],
    canMatch: [...inheritedPolicies.canMatch, ...definition.canMatch],
  };
};

const renderRouteElement = (
  route: Route,
  basePath: string | undefined,
  fallback: React.ReactNode,
  routeKey: string,
  routePathname: string,
  routeRuntime: RouteRuntimeAdapter,
): React.ReactNode => {
  const definition = getRouteDefinition(route);
  const content = definition.load ? (
    <LazyModuleView key={routeKey} moduleRuntime={routeRuntime.getModuleRuntime()} routeRuntime={routeRuntime} />
  ) : (
    <RoutePendingBoundary basePath={basePath} fallback={fallback} pathname={routePathname}>
      <Outlet />
    </RoutePendingBoundary>
  );

  return (
    <RuntimeScopeProvider scope={routeRuntime.getRouteScope()}>
      {renderLayouts(definition.layouts, content)}
    </RuntimeScopeProvider>
  );
};
