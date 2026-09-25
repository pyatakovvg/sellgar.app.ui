import type React from 'react';

import {
  configureRouterRuntimeComposition,
  Router as CoreRouter,
  type RouterDeclaration,
  type RouterOptions as CoreRouterOptions,
} from '../../../../core/router/declaration/router';
import { getLayoutMetadata, type LayoutConstructor } from '../../../layout/declaration/layout';

export interface RouterOptions extends Omit<CoreRouterOptions, 'canActivate' | 'canMatch'> {
  readonly exception?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly notFound?: React.ReactNode;
}

export interface RouterPresentationDefinition {
  readonly exception: React.ReactNode | undefined;
  readonly layouts: readonly LayoutConstructor[];
  readonly notFound: React.ReactNode | undefined;
}

export interface Router extends RouterDeclaration {}

class FsmRouter extends CoreRouter implements Router {
  constructor(options: RouterOptions) {
    super(options);

    const layouts = Object.freeze([...(options.layouts ?? [])]);

    configureRouterRuntimeComposition(this, {
      bindingOwners: layouts,
      providers: [
        ...(options.providers ?? []),
        ...layouts.flatMap((layout) => getLayoutMetadata(layout).providers ?? []),
      ],
    });

    routerPresentationDefinitions.set(this, {
      exception: options.exception,
      layouts,
      notFound: options.notFound,
    });
  }
}

const EMPTY_ROUTER_PRESENTATION = Object.freeze<RouterPresentationDefinition>({
  exception: undefined,
  layouts: Object.freeze([]),
  notFound: undefined,
});
const routerPresentationDefinitions = new WeakMap<RouterDeclaration, RouterPresentationDefinition>();

export const Router: new (options: RouterOptions) => Router = FsmRouter;

export const getRouterPresentationDefinition = (router: RouterDeclaration): RouterPresentationDefinition => {
  return routerPresentationDefinitions.get(router) ?? EMPTY_ROUTER_PRESENTATION;
};
