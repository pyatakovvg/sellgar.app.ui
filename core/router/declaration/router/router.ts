import { type RouteDeclaration, validateSiblingRoutes } from '../route';
import type { RouteParams, RouteToken } from '../route-token';
import type { PolicyBoundaryDecision } from '../../../policy/contract/policy-boundary-decision';
import type { ProviderToken } from '../../../runtime/provider/provider-token';
import type { RoutePolicyDeclaration } from '../../runtime/route-runtime-context';

const routerDeclarationBrand = Symbol('router-declaration');

export interface RouterDeclaration {
  readonly [routerDeclarationBrand]: true;
}

export interface FirstAvailableRouteDefault {
  readonly type: 'first-available';
}

export interface RouterOptions {
  readonly canActivate?: readonly RoutePolicyDeclaration[];
  readonly canMatch?: readonly RoutePolicyDeclaration[];
  readonly providers?: readonly ProviderToken[];
  readonly routes: readonly RouteDeclaration[];
}

export interface RouterDefinition {
  readonly bindingOwners: readonly unknown[];
  readonly canActivate: readonly RoutePolicyDeclaration[];
  readonly canMatch: readonly RoutePolicyDeclaration[];
  readonly providers: readonly ProviderToken[];
  readonly routes: readonly RouteDeclaration[];
}

export interface RouterRuntimeComposition {
  readonly bindingOwners?: readonly unknown[];
  readonly providers?: readonly ProviderToken[];
}

export interface RouterRedirectOptions {
  readonly replace?: boolean;
  readonly saveCurrentLocation?: boolean;
}

export interface RouterRedirectToSavedOptions {
  readonly replace?: boolean;
}

type Exact<TActual, TExpected> = TActual & Record<Exclude<keyof TActual, keyof TExpected>, never>;

type TokenHasParams<TToken extends RouteToken> = keyof RouteParams<TToken> extends never ? false : true;

export type RouterRedirectArguments<TToken extends RouteToken, TParams extends RouteParams<TToken>> =
  TokenHasParams<TToken> extends true
    ? [options: RouterRedirectOptions & { readonly params: Exact<TParams, RouteParams<TToken>> }]
    : [options?: RouterRedirectOptions & { readonly params?: never }];

export class Router implements RouterDeclaration {
  declare readonly [routerDeclarationBrand]: true;

  constructor(options: RouterOptions) {
    if (options.routes.length === 0) {
      throw new Error('Router.routes не может быть пустым.');
    }

    const canActivate = Object.freeze([...(options.canActivate ?? [])]);
    const canMatch = Object.freeze([...(options.canMatch ?? [])]);
    const providers = Object.freeze([...(options.providers ?? [])]);
    const routes = Object.freeze([...options.routes]);

    validateSiblingRoutes(routes);
    routerDefinitions.set(this, {
      bindingOwners: Object.freeze([]),
      canActivate,
      canMatch,
      providers,
      routes,
    });
  }

  static continue(): PolicyBoundaryDecision {
    return { type: 'continue' };
  }

  static error(error: unknown): PolicyBoundaryDecision {
    return { error, type: 'error' };
  }

  static firstAvailable(): FirstAvailableRouteDefault {
    return FIRST_AVAILABLE_ROUTE_DEFAULT;
  }

  static forbidden(): PolicyBoundaryDecision {
    return { type: 'forbidden' };
  }

  static notFound(): PolicyBoundaryDecision {
    return { type: 'not-found' };
  }

  static redirectTo<const TToken extends RouteToken, const TParams extends RouteParams<TToken> = RouteParams<TToken>>(
    token: TToken,
    ...args: RouterRedirectArguments<TToken, TParams>
  ): PolicyBoundaryDecision {
    const options = (args[0] ?? {}) as RouterRedirectOptions & {
      readonly params?: Readonly<Record<string, unknown>>;
    };

    return {
      params: Object.freeze({ ...(options.params ?? {}) }),
      replace: options.replace ?? false,
      saveCurrentLocation: options.saveCurrentLocation ?? false,
      to: token,
      type: 'redirect',
    };
  }

  static redirectToSaved(options: RouterRedirectToSavedOptions = {}): PolicyBoundaryDecision {
    return {
      replace: options.replace ?? false,
      type: 'redirect-to-saved-location',
    };
  }
}

const FIRST_AVAILABLE_ROUTE_DEFAULT = Object.freeze({ type: 'first-available' as const });
const routerDefinitions = new WeakMap<RouterDeclaration, RouterDefinition>();

export const getRouterDefinition = (router: RouterDeclaration): RouterDefinition => {
  const definition = routerDefinitions.get(router);

  if (!definition) {
    throw new Error('Router declaration не принадлежит @sellgar/app.');
  }

  return definition;
};

export const configureRouterRuntimeComposition = (
  router: RouterDeclaration,
  composition: RouterRuntimeComposition,
): void => {
  const definition = getRouterDefinition(router);

  routerDefinitions.set(router, {
    ...definition,
    bindingOwners: Object.freeze([...(composition.bindingOwners ?? definition.bindingOwners)]),
    providers: Object.freeze([...(composition.providers ?? definition.providers)]),
  });
};

export const isFirstAvailableRouteDefault = (
  value: FirstAvailableRouteDefault | object,
): value is FirstAvailableRouteDefault => {
  return 'type' in value && value.type === 'first-available';
};
