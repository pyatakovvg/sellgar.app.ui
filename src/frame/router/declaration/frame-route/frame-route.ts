import type React from 'react';

import type { LayoutConstructor } from '../../../../layout/declaration/layout';
import type { RoutePolicyDeclaration } from '../../../../router/runtime/route-runtime-context';
import type { ProviderToken } from '../../../../runtime/provider/provider-token.ts';

export type FrameLoader = () => Promise<Record<string, unknown>>;

export interface FrameRouteOptions {
  readonly canActivate?: readonly RoutePolicyDeclaration[];
  readonly canMatch?: readonly RoutePolicyDeclaration[];
  readonly defaultTo?: string;
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly load?: FrameLoader;
  readonly layouts?: readonly LayoutConstructor[];
  readonly notFound?: React.ReactNode;
  readonly path?: string;
  readonly providers?: readonly ProviderToken[];
  readonly routes?: readonly FrameRoute[];
}

export interface FrameRouteDefinition {
  readonly canActivate: readonly RoutePolicyDeclaration[];
  readonly canMatch: readonly RoutePolicyDeclaration[];
  readonly defaultTo: string | undefined;
  readonly exception: React.ReactNode | undefined;
  readonly fallback: React.ReactNode | undefined;
  readonly forbidden: React.ReactNode | undefined;
  readonly load: FrameLoader | undefined;
  readonly layouts: readonly LayoutConstructor[];
  readonly notFound: React.ReactNode | undefined;
  readonly path: string | undefined;
  readonly providers: readonly ProviderToken[];
  readonly routes: readonly FrameRoute[];
}

const frameRouteDefinitions = new WeakMap<FrameRoute, FrameRouteDefinition>();

export class FrameRoute {
  declare private readonly frameRouteBrand: void;

  constructor(options: FrameRouteOptions) {
    validateFrameRouteOptions(options);

    frameRouteDefinitions.set(this, {
      canActivate: [...(options.canActivate ?? [])],
      canMatch: [...(options.canMatch ?? [])],
      defaultTo: options.defaultTo,
      exception: options.exception,
      fallback: options.fallback,
      forbidden: options.forbidden,
      load: options.load,
      layouts: [...(options.layouts ?? [])],
      notFound: options.notFound,
      path: options.path,
      providers: [...(options.providers ?? [])],
      routes: [...(options.routes ?? [])],
    });
  }
}

export const getFrameRouteDefinition = (route: FrameRoute): FrameRouteDefinition => {
  const definition = frameRouteDefinitions.get(route);

  if (!definition) {
    throw new Error('Декларация frame-маршрута не определена.');
  }

  return definition;
};

const validateFrameRouteOptions = (options: FrameRouteOptions): void => {
  const hasLoad = options.load !== undefined;
  const hasRoutes = options.routes !== undefined;

  if (hasLoad === hasRoutes) {
    throw new Error('FrameRoute должен определять либо load, либо routes.');
  }

  if (options.path !== undefined && normalizeFrameRoutePath(options.path).length === 0) {
    throw new Error('Путь frame-маршрута не может быть пустым.');
  }

  if (options.defaultTo !== undefined && normalizeFrameRoutePath(options.defaultTo).length === 0) {
    throw new Error('defaultTo frame-маршрута не может быть пустым.');
  }

  if (options.defaultTo !== undefined && !hasRoutes) {
    throw new Error('defaultTo frame-маршрута можно использовать только в группе маршрутов.');
  }

  if (hasRoutes) {
    validateDefaultFrameRoute(options.defaultTo, options.routes ?? []);
    validateChildFrameRoutes(options.routes ?? []);
  }
};

const validateDefaultFrameRoute = (defaultTo: string | undefined, routes: readonly FrameRoute[]): void => {
  if (defaultTo === undefined) {
    return;
  }

  if (routes.some((route) => getFrameRouteDefinition(route).path === undefined)) {
    throw new Error('Frame-маршрут не может одновременно определять defaultTo и индексный дочерний маршрут.');
  }
};

const validateChildFrameRoutes = (routes: readonly FrameRoute[]): void => {
  if (routes.length === 0) {
    throw new Error('Дочерние frame-маршруты не могут быть пустыми.');
  }

  const paths = new Set<string>();
  let hasIndexRoute = false;

  for (const route of routes) {
    const definition = getFrameRouteDefinition(route);

    if (definition.path === undefined) {
      if (hasIndexRoute) {
        throw new Error('Дочерние frame-маршруты не могут определять несколько индексных маршрутов.');
      }

      hasIndexRoute = true;
      continue;
    }

    const path = normalizeFrameRoutePath(definition.path);

    if (paths.has(path)) {
      throw new Error(`Дочерние frame-маршруты не могут определять дублирующийся путь: ${definition.path}.`);
    }

    paths.add(path);
  }
};

export const normalizeFrameRoutePath = (path: string): string => {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
};
