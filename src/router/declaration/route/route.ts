import type React from 'react';

import { isFrameRouter, type FrameRouter } from '../../../frame/router/declaration';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';
import type { RoutePolicyDeclaration } from '../../runtime/route-runtime-context';

export interface RouteOptions {
  readonly canAction?: readonly RoutePolicyDeclaration[];
  readonly canActivate?: readonly RoutePolicyDeclaration[];
  readonly canMatch?: readonly RoutePolicyDeclaration[];
  readonly defaultTo?: RouteDefaultTo;
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly frames?: readonly FrameRouter[];
  readonly layouts?: readonly LayoutConstructor[];
  readonly load?: () => Promise<Record<string, unknown>>;
  readonly notFound?: React.ReactNode;
  readonly path?: string;
  readonly providers?: readonly ProviderToken[];
  readonly routes?: readonly Route[];
}

export interface RouteDefinition {
  readonly runtimeId: string;
  readonly canAction: readonly RoutePolicyDeclaration[];
  readonly canActivate: readonly RoutePolicyDeclaration[];
  readonly canMatch: readonly RoutePolicyDeclaration[];
  readonly defaultTo: RouteDefaultTo | undefined;
  readonly exception: React.ReactNode | undefined;
  readonly fallback: React.ReactNode | undefined;
  readonly forbidden: React.ReactNode | undefined;
  readonly frames: readonly FrameRouter[];
  readonly layouts: readonly LayoutConstructor[];
  readonly load: (() => Promise<Record<string, unknown>>) | undefined;
  readonly notFound: React.ReactNode | undefined;
  readonly path: string | undefined;
  readonly providers: readonly ProviderToken[];
  readonly routes: readonly Route[];
}

const routeDefinitions = new WeakMap<Route, RouteDefinition>();

export class Route {
  declare private readonly routeBrand: void;

  constructor(options: RouteOptions) {
    validateRouteOptions(options);

    routeDefinitions.set(this, {
      runtimeId: createRouteRuntimeId(),
      canAction: [...(options.canAction ?? [])],
      canActivate: [...(options.canActivate ?? [])],
      canMatch: [...(options.canMatch ?? [])],
      defaultTo: options.defaultTo,
      exception: options.exception,
      fallback: options.fallback,
      forbidden: options.forbidden,
      frames: [...(options.frames ?? [])],
      layouts: [...(options.layouts ?? [])],
      load: options.load,
      notFound: options.notFound,
      path: options.path,
      providers: [...(options.providers ?? [])],
      routes: [...(options.routes ?? [])],
    });
  }
}

export const getRouteDefinition = (route: Route): RouteDefinition => {
  const definition = routeDefinitions.get(route);

  if (!definition) {
    throw new Error('Декларация маршрута не определена.');
  }

  return definition;
};

export interface FirstAvailableRouteDefault {
  readonly type: 'first-available';
}

export type RouteDefaultTo = string | FirstAvailableRouteDefault;

export const createFirstAvailableRouteDefault = (): FirstAvailableRouteDefault => {
  return {
    type: 'first-available',
  };
};

export const isFirstAvailableRouteDefault = (value: RouteDefaultTo): value is FirstAvailableRouteDefault => {
  return typeof value === 'object' && value.type === 'first-available';
};

const createRouteRuntimeId = (): string => {
  return `route:${++routeRuntimeIdCounter}`;
};

const validateRouteOptions = (options: RouteOptions): void => {
  const hasLoad = options.load !== undefined;
  const hasRoutes = options.routes !== undefined;

  if (hasLoad && hasRoutes) {
    throw new Error('Маршрут не может одновременно определять load и routes.');
  }

  if (!hasLoad && !hasRoutes) {
    throw new Error('Маршрут должен определять load или routes.');
  }

  if (options.path !== undefined && options.path.length === 0) {
    throw new Error('Путь маршрута не может быть пустым.');
  }

  if (typeof options.defaultTo === 'string' && options.defaultTo.length === 0) {
    throw new Error('defaultTo маршрута не может быть пустым.');
  }

  if (options.frames?.some((frameRouter) => !isFrameRouter(frameRouter))) {
    throw new Error('Route.frames принимает только FrameRouter.');
  }

  if (options.defaultTo !== undefined && !hasRoutes) {
    throw new Error('defaultTo маршрута можно использовать только в группах маршрутов.');
  }

  if (hasRoutes) {
    validateDefaultRoute(options.defaultTo, options.routes ?? []);
    validateChildRoutes(options.routes ?? []);
  }
};

const validateDefaultRoute = (defaultTo: RouteDefaultTo | undefined, routes: readonly Route[]): void => {
  if (defaultTo === undefined) {
    return;
  }

  if (
    routes.some((route) => {
      const definition = getRouteDefinition(route);

      return definition.path === undefined && definition.load !== undefined;
    })
  ) {
    throw new Error('Маршрут не может одновременно определять defaultTo и индексный дочерний маршрут.');
  }
};

const validateChildRoutes = (routes: readonly Route[]): void => {
  if (routes.length === 0) {
    throw new Error('Дочерние маршруты не могут быть пустыми.');
  }

  const paths = new Set<string>();
  let hasIndexRoute = false;

  for (const route of routes) {
    const definition = getRouteDefinition(route);

    if (definition.path === undefined) {
      if (definition.load === undefined) {
        continue;
      }

      if (hasIndexRoute) {
        throw new Error('Дочерние маршруты не могут определять дублирующиеся индексные маршруты.');
      }

      hasIndexRoute = true;
      continue;
    }

    const normalizedPath = normalizeRoutePath(definition.path);

    if (paths.has(normalizedPath)) {
      throw new Error(`Дочерние маршруты не могут определять дублирующийся путь: ${definition.path}.`);
    }

    paths.add(normalizedPath);
  }
};

const normalizeRoutePath = (path: string): string => {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
};

let routeRuntimeIdCounter = 0;
