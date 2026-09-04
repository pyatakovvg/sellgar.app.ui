import { getRouteAddressIdentity, type RouteAddress } from '../address';
import type { RouteParamKey, RouteToken } from '../route-token';
import type { FirstAvailableRouteDefault, RouterDeclaration } from '../router';
import type { ProviderToken } from '../../../runtime/provider/provider-token';
import type { RoutePolicyDeclaration } from '../../runtime/route-runtime-context';

const routeDeclarationBrand = Symbol('route-declaration');

export interface RouteDeclaration {
  readonly [routeDeclarationBrand]: true;
}

export type RouteDefault = RouteToken | FirstAvailableRouteDefault;

export interface RouteOptions<
  TToken extends RouteToken | undefined = RouteToken | undefined,
  TAddress extends RouteAddress | undefined = RouteAddress | undefined,
> {
  readonly address?: TAddress;
  readonly canAction?: readonly RoutePolicyDeclaration[];
  readonly canActivate?: readonly RoutePolicyDeclaration[];
  readonly canMatch?: readonly RoutePolicyDeclaration[];
  readonly defaultTo?: RouteDefault;
  readonly load?: () => Promise<Record<string, unknown>>;
  readonly providers?: readonly ProviderToken[];
  readonly routes?: readonly RouteDeclaration[];
  readonly routing?: readonly RouterDeclaration[];
  readonly token?: TToken;
}

type AddressParamName<TAddress> = TAddress extends RouteAddress<infer TName> ? TName : never;

type RouteParamsMismatch<TToken extends RouteToken, TAddress extends RouteAddress | undefined> =
  Exclude<RouteParamKey<TToken>, AddressParamName<TAddress>> extends never
    ? Exclude<AddressParamName<TAddress>, RouteParamKey<TToken>> extends never
      ? unknown
      : {
          readonly __routeTokenMissingParams__: Exclude<AddressParamName<TAddress>, RouteParamKey<TToken>>;
        }
    : {
        readonly __routeTokenExtraParams__: Exclude<RouteParamKey<TToken>, AddressParamName<TAddress>>;
      };

type RouteParamsContract<
  TToken extends RouteToken | undefined,
  TAddress extends RouteAddress | undefined,
> = TToken extends RouteToken ? RouteParamsMismatch<TToken, TAddress> : unknown;

export type RouteConstructorOptions<
  TToken extends RouteToken | undefined = RouteToken | undefined,
  TAddress extends RouteAddress | undefined = RouteAddress | undefined,
> = RouteOptions<TToken, TAddress> & RouteParamsContract<TToken, TAddress>;

export interface RouteDefinition {
  readonly address: RouteAddress | undefined;
  readonly bindingOwners: readonly unknown[];
  readonly canAction: readonly RoutePolicyDeclaration[];
  readonly canActivate: readonly RoutePolicyDeclaration[];
  readonly canMatch: readonly RoutePolicyDeclaration[];
  readonly defaultTo: RouteDefault | undefined;
  readonly load: (() => Promise<Record<string, unknown>>) | undefined;
  readonly providers: readonly ProviderToken[];
  readonly routes: readonly RouteDeclaration[];
  readonly routing: readonly RouterDeclaration[];
  readonly token: RouteToken | undefined;
}

export interface RouteRuntimeComposition {
  readonly bindingOwners?: readonly unknown[];
  readonly providers?: readonly ProviderToken[];
}

export class Route<
  const TToken extends RouteToken | undefined = undefined,
  const TAddress extends RouteAddress | undefined = undefined,
> implements RouteDeclaration {
  declare readonly [routeDeclarationBrand]: true;

  constructor(options: RouteConstructorOptions<TToken, TAddress>) {
    validateRouteOptions(options);

    routeDefinitions.set(this, {
      address: options.address,
      bindingOwners: Object.freeze([]),
      canAction: Object.freeze([...(options.canAction ?? [])]),
      canActivate: Object.freeze([...(options.canActivate ?? [])]),
      canMatch: Object.freeze([...(options.canMatch ?? [])]),
      defaultTo: options.defaultTo,
      load: options.load,
      providers: Object.freeze([...(options.providers ?? [])]),
      routes: Object.freeze([...(options.routes ?? [])]),
      routing: Object.freeze([...(options.routing ?? [])]),
      token: options.token,
    });
  }
}

const routeDefinitions = new WeakMap<RouteDeclaration, RouteDefinition>();

export const getRouteDefinition = (route: RouteDeclaration): RouteDefinition => {
  const definition = routeDefinitions.get(route);

  if (!definition) {
    throw new Error('Route declaration не принадлежит @sellgar/app.');
  }

  return definition;
};

export const configureRouteRuntimeComposition = (
  route: RouteDeclaration,
  composition: RouteRuntimeComposition,
): void => {
  const definition = getRouteDefinition(route);

  routeDefinitions.set(route, {
    ...definition,
    bindingOwners: Object.freeze([...(composition.bindingOwners ?? definition.bindingOwners)]),
    providers: Object.freeze([...(composition.providers ?? definition.providers)]),
  });
};

export const validateSiblingRoutes = (routes: readonly RouteDeclaration[]): void => {
  const addresses = new Set<string>();
  let hasIndex = false;

  for (const route of routes) {
    const definition = getRouteDefinition(route);
    const identity = getRouteAddressIdentity(definition.address);

    if (identity === undefined) {
      if (isIndexRoute(definition)) {
        if (hasIndex) {
          throw new Error('Sibling Routes не могут содержать несколько index Route.');
        }

        hasIndex = true;
      }

      continue;
    }

    if (addresses.has(identity)) {
      throw new Error(`Sibling Routes не могут содержать одинаковый address: ${identity}.`);
    }

    addresses.add(identity);
  }
};

const validateRouteOptions = (options: RouteOptions): void => {
  const routes = options.routes;
  const routing = options.routing;

  if (routes && routes.length === 0) {
    throw new Error('Route.routes не может быть пустым.');
  }

  if (routing && routing.length === 0) {
    throw new Error('Route.routing не может быть пустым.');
  }

  if (!options.load && !routes?.length && !routing?.length) {
    throw new Error('Route должна определять load, непустой routes или непустой routing.');
  }

  if (options.defaultTo && !routes) {
    throw new Error('Route.defaultTo допустим только для Route с дочерними routes.');
  }

  if (routes) {
    validateSiblingRoutes(routes);

    if (options.defaultTo && hasIndexRoute(routes)) {
      throw new Error('Route не может одновременно определять defaultTo и index Route.');
    }
  }
};

const hasIndexRoute = (routes: readonly RouteDeclaration[]): boolean => {
  return routes.some((route) => isIndexRoute(getRouteDefinition(route)));
};

const isIndexRoute = (definition: RouteDefinition): boolean => {
  return definition.address === undefined && definition.load !== undefined;
};
