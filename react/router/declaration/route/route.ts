import type React from 'react';

import type { RouteAddress } from '../../../../core/router/declaration/address';
import {
  configureRouteRuntimeComposition,
  Route as CoreRoute,
  type RouteConstructorOptions as CoreRouteOptions,
  type RouteDeclaration,
} from '../../../../core/router/declaration/route';
import type { RouteToken } from '../../../../core/router/declaration/route-token';
import { getLayoutMetadata, type LayoutConstructor } from '../../../layout/declaration/layout';

type ReactRouteModuleExports = Readonly<Record<string, unknown>>;
type ReactRouteModuleLoader = () => Promise<ReactRouteModuleExports>;

export type RouteOptions<
  TToken extends RouteToken | undefined = RouteToken | undefined,
  TAddress extends RouteAddress | undefined = RouteAddress | undefined,
> = CoreRouteOptions<TToken, TAddress> & {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly load?: ReactRouteModuleLoader;
  readonly notFound?: React.ReactNode;
};

export interface RoutePresentationDefinition {
  readonly exception: React.ReactNode | undefined;
  readonly fallback: React.ReactNode | undefined;
  readonly forbidden: React.ReactNode | undefined;
  readonly layouts: readonly LayoutConstructor[];
  readonly notFound: React.ReactNode | undefined;
}

export class Route<
  const TToken extends RouteToken | undefined = undefined,
  const TAddress extends RouteAddress | undefined = undefined,
> extends CoreRoute<TToken, TAddress> {
  constructor(options: RouteOptions<TToken, TAddress>) {
    super(options);

    const layouts = Object.freeze([...(options.layouts ?? [])]);

    configureRouteRuntimeComposition(this, {
      bindingOwners: layouts,
      providers: [
        ...(options.providers ?? []),
        ...layouts.flatMap((layout) => getLayoutMetadata(layout).providers ?? []),
      ],
    });
    routePresentationDefinitions.set(this, {
      exception: options.exception,
      fallback: options.fallback,
      forbidden: options.forbidden,
      layouts,
      notFound: options.notFound,
    });
  }
}

const EMPTY_ROUTE_PRESENTATION = Object.freeze<RoutePresentationDefinition>({
  exception: undefined,
  fallback: undefined,
  forbidden: undefined,
  layouts: Object.freeze([]),
  notFound: undefined,
});
const routePresentationDefinitions = new WeakMap<RouteDeclaration, RoutePresentationDefinition>();

export const getRoutePresentationDefinition = (route: RouteDeclaration): RoutePresentationDefinition => {
  return routePresentationDefinitions.get(route) ?? EMPTY_ROUTE_PRESENTATION;
};
