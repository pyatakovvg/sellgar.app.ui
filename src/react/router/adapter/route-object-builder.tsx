import React from 'react';
import {
  Outlet,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type RouteObject,
  type ShouldRevalidateFunctionArgs,
} from 'react-router';

import { getLayoutMetadata } from '../../../layout/declaration/layout';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import type { ApplicationComponents } from '../../../application/config/application-configurator';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import type { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import type { FrameConstructor } from '../../../frame/declaration/frame';
import type { Route } from '../../../router/declaration/route';
import { RouteRuntime } from '../../../router/runtime/route-runtime';
import type { RoutePolicyDeclarations } from '../../../router/runtime/route-runtime-context';
import type { RouteRuntimeHandle } from '../../../router/runtime/router-runtime';
import { createRoutePathname } from '../../../router/utils/route-pathname';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ApplicationScope } from '../../../runtime/scope/kind';
import type { RuntimeScope } from '../../../runtime/scope/base';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';

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
  readonly inheritedFrames: readonly FrameConstructor[];
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
  readonly availableFrames: readonly FrameConstructor[];
  readonly loaderPolicies: RoutePolicyDeclarations;
  readonly basePath?: string;
  readonly route: Route;
  readonly routePathname: string;
  readonly session: SessionRuntimeStateInterface;
}

export type RouteRuntimeFactory = (context: RouteRuntimeFactoryContext) => RouteRuntimeAdapter;

export interface RouteRuntimeAdapter extends RouteRuntimeHandle {
  action(args: ActionFunctionArgs): Promise<unknown>;
  getException(inheritedException?: React.ReactNode): React.ReactNode;
  getModuleRuntime(): ModuleRuntime;
  getRouteScope(): RuntimeScope;
  loader(args: LoaderFunctionArgs): Promise<unknown>;
}

export interface RouteRuntimeRegistry {
  register(
    routeId: string,
    routeRuntime: RouteRuntimeHandle,
    options?: {
      readonly exception?: React.ReactNode;
      readonly forbidden?: React.ReactNode;
      readonly frames?: readonly FrameConstructor[];
      readonly resolveException?: () => React.ReactNode;
    },
  ): void;
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
  const routeKey = createRouteKey(route, options.parentKey);
  const routePathname = createRoutePathname(options.parentPathname, route.path);
  const policies = mergeRoutePolicies(options.inheritedPolicies, route);
  const availableFrames = mergeRouteFrames(options.inheritedFrames, route);
  const loaderPolicies = shouldInheritLoaderPolicies(route) ? policies : createRoutePolicies(route);
  const routeRuntime = routeRuntimeFactory({
    actionPolicies: policies,
    app: options.app,
    applicationScope: options.applicationScope,
    availableFrames,
    basePath: options.basePath,
    loaderPolicies,
    route,
    routePathname,
    session: options.session,
  });

  const routeException = route.exception ?? options.inheritedException;
  const routeFallback = route.fallback ?? options.inheritedFallback;
  const routeForbidden = route.forbidden ?? options.inheritedForbidden;
  const routeNotFound = route.notFound ?? options.inheritedNotFound;
  const element = renderRouteElement(route, options.basePath, routeFallback, routeKey, routePathname, routeRuntime);

  options.routerRuntime.register(routeKey, routeRuntime, {
    exception: routeException,
    forbidden: options.components.forbidden,
    frames: availableFrames,
    resolveException: () => routeRuntime.getException(routeException),
  });

  if (isIndexRoute(route)) {
    return {
      id: routeKey,
      index: true,
      element,
      action: route.load ? (args) => routeRuntime.action(args) : undefined,
      errorElement: (
        <RouteExceptionBoundary
          exception={routeException}
          forbidden={routeForbidden}
          notFound={routeNotFound}
          routeRuntime={routeRuntime}
        />
      ),
      loader: shouldHandleRouteLoader(route) ? (args) => routeRuntime.loader(args) : undefined,
      shouldRevalidate: createRouteShouldRevalidate(route, options.basePath, routePathname),
    };
  }

  return {
    id: routeKey,
    path: normalizeRoutePath(route.path),
    element,
    action: route.load ? (args) => routeRuntime.action(args) : undefined,
    errorElement: (
      <RouteExceptionBoundary
        exception={routeException}
        forbidden={routeForbidden}
        notFound={routeNotFound}
        routeRuntime={routeRuntime}
      />
    ),
    loader: shouldHandleRouteLoader(route) ? (args) => routeRuntime.loader(args) : undefined,
    shouldRevalidate: createRouteShouldRevalidate(route, options.basePath, routePathname),
    children: createRouteChildren({
      ...options,
      inheritedException: routeException,
      inheritedFallback: routeFallback,
      inheritedForbidden: routeForbidden,
      inheritedFrames: availableFrames,
      inheritedNotFound: routeNotFound,
      inheritedPolicies: policies,
      appendNotFoundRoute: shouldAppendBranchNotFoundRoute(route, routeNotFound),
      parentPathname: routePathname,
      parentKey: routeKey,
      route,
      routeRuntimeFactory,
      routes: route.routes,
    }),
  };
};

const createRouteChildren = (options: RouteObjectBuilderOptions & { readonly route: Route }): RouteObject[] => {
  const children = createRouteObjects(options);

  if (options.route.defaultTo === undefined) {
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
    context.availableFrames,
    context.routePathname,
    context.basePath,
  );
};

const isIndexRoute = (route: Route): boolean => {
  return route.path === undefined && route.routes.length === 0;
};

const shouldHandleRouteLoader = (route: Route): boolean => {
  return (
    route.defaultTo !== undefined ||
    route.load !== undefined ||
    hasRuntimeProviders(route) ||
    route.canMatch.length > 0 ||
    route.canActivate.length > 0
  );
};

const shouldInheritLoaderPolicies = (route: Route): boolean => {
  return route.load !== undefined || hasRuntimeProviders(route);
};

const hasRuntimeProviders = (route: Route): boolean => {
  return (
    route.providers.length > 0 ||
    route.layouts.some((layout) => {
      return (getLayoutMetadata(layout).providers?.length ?? 0) > 0;
    })
  );
};

const shouldAppendNotFoundRoute = (options: RouteObjectBuilderOptions): boolean => {
  return (
    options.appendNotFoundRoute === true &&
    options.inheritedNotFound !== undefined &&
    !options.routes.some((route) => route.path === '*')
  );
};

const shouldAppendBranchNotFoundRoute = (route: Route, notFound: React.ReactNode | undefined): boolean => {
  if (route.load !== undefined) {
    return false;
  }

  return route.notFound !== undefined || (route.path !== undefined && notFound !== undefined);
};

const createLeafNotFoundRouteObject = (options: RouteObjectBuilderOptions, route: Route): RouteObject | null => {
  const notFound = route.notFound ?? options.inheritedNotFound;
  const routePath = normalizeRoutePath(route.path);

  if (
    route.load === undefined ||
    routePath === undefined ||
    routePath === '*' ||
    routePath.endsWith('/*') ||
    notFound === undefined ||
    options.routes.some((sibling) => normalizeRoutePath(sibling.path) === `${routePath}/*`)
  ) {
    return null;
  }

  return createNotFoundRouteObject(
    route.exception ?? options.inheritedException,
    route.forbidden ?? options.inheritedForbidden,
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
  return (args) => {
    if (isHashOnlyNavigation(args.currentUrl, args.nextUrl)) {
      return false;
    }

    if (route.defaultTo !== undefined && isRoutePathnameRequest(args.nextUrl, basePath, routePathname)) {
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
  return `${parentKey}.${route.runtimeId}`;
};

const createRoutePolicies = (route: Route): RoutePolicyDeclarations => {
  return {
    canAction: [],
    canActivate: route.canActivate,
    canMatch: route.canMatch,
  };
};

const mergeRoutePolicies = (inheritedPolicies: RoutePolicyDeclarations, route: Route): RoutePolicyDeclarations => {
  return {
    canAction: [...inheritedPolicies.canAction, ...route.canAction],
    canActivate: [...inheritedPolicies.canActivate, ...route.canActivate],
    canMatch: [...inheritedPolicies.canMatch, ...route.canMatch],
  };
};

const mergeRouteFrames = (inheritedFrames: readonly FrameConstructor[], route: Route): readonly FrameConstructor[] => {
  return [...new Set([...inheritedFrames, ...route.frames])];
};

const renderRouteElement = (
  route: Route,
  basePath: string | undefined,
  fallback: React.ReactNode,
  routeKey: string,
  routePathname: string,
  routeRuntime: RouteRuntimeAdapter,
): React.ReactNode => {
  const content = route.load ? (
    <LazyModuleView key={routeKey} moduleRuntime={routeRuntime.getModuleRuntime()} />
  ) : (
    <RoutePendingBoundary basePath={basePath} fallback={fallback} pathname={routePathname}>
      <Outlet />
    </RoutePendingBoundary>
  );

  return (
    <RuntimeScopeProvider scope={routeRuntime.getRouteScope()}>
      {renderLayouts(route.layouts, content)}
    </RuntimeScopeProvider>
  );
};
