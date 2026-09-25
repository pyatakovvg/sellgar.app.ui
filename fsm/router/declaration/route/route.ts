import type React from 'react';

import type { RouteAddress } from '../../../../core/router/declaration/address';
import {
  configureRouteRuntimeComposition,
  Route as CoreRoute,
  type RouteConstructorOptions as CoreRouteOptions,
  type RouteOptions as CoreRouteDeclarationOptions,
  type RouteDeclaration,
} from '../../../../core/router/declaration/route';
import type { RouteToken } from '../../../../core/router/declaration/route-token';
import { getLayoutMetadata, type LayoutConstructor } from '../../../layout/declaration/layout';
import { isFsmToken, type FsmToken } from '../../../token/declaration/fsm-token';
import { createScreenServiceOwner, ScreenServiceProvider } from '../../../service/screen-service';

type FsmRouteModuleExports = Readonly<Record<string, unknown>>;
type FsmRouteModuleLoader = () => Promise<FsmRouteModuleExports>;

export type RouteOptions<
  TToken extends RouteToken | undefined = RouteToken | undefined,
  TAddress extends RouteAddress | undefined = RouteAddress | undefined,
> = (TToken extends FsmToken ? CoreRouteDeclarationOptions<TToken, TAddress> : CoreRouteOptions<TToken, TAddress>) & {
  readonly canAction?: never;
  readonly canActivate?: never;
  readonly canMatch?: never;
  readonly defaultTo?: never;
  readonly routing?: never;
  readonly exception?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly load?: FsmRouteModuleLoader;
  readonly notFound?: React.ReactNode;
};

export interface RoutePresentationDefinition {
  readonly exception: React.ReactNode | undefined;
  readonly layouts: readonly LayoutConstructor[];
  readonly notFound: React.ReactNode | undefined;
}

export class Route<
  const TToken extends RouteToken | undefined = undefined,
  const TAddress extends RouteAddress | undefined = undefined,
> extends CoreRoute<TToken, TAddress> {
  constructor(options: RouteOptions<TToken, TAddress>) {
    // FSM token fields describe state and commands, not address parameters.
    super(options as CoreRouteOptions<TToken, TAddress>);

    const layouts = Object.freeze([...(options.layouts ?? [])]);
    const fsmToken = isFsmToken(options.token) ? options.token : null;

    configureRouteRuntimeComposition(this, {
      bindingOwners: [...layouts, ...(fsmToken ? [createScreenServiceOwner(fsmToken)] : [])],
      providers: [
        ...(fsmToken ? [ScreenServiceProvider] : []),
        ...(options.providers ?? []),
        ...layouts.flatMap((layout) => getLayoutMetadata(layout).providers ?? []),
      ],
    });
    routePresentationDefinitions.set(this, {
      exception: options.exception,
      layouts,
      notFound: options.notFound,
    });
  }
}

const EMPTY_ROUTE_PRESENTATION = Object.freeze<RoutePresentationDefinition>({
  exception: undefined,
  layouts: Object.freeze([]),
  notFound: undefined,
});
const routePresentationDefinitions = new WeakMap<RouteDeclaration, RoutePresentationDefinition>();

export const getRoutePresentationDefinition = (route: RouteDeclaration): RoutePresentationDefinition => {
  return routePresentationDefinitions.get(route) ?? EMPTY_ROUTE_PRESENTATION;
};
