import type React from 'react';

import {
  configureRouterRuntimeComposition,
  Router as CoreRouter,
  type RouterDeclaration,
  type RouterOptions as CoreRouterOptions,
} from '../../../../core/router/declaration/router';
import { getLayoutMetadata, type LayoutConstructor } from '../../../layout/declaration/layout';
import { getShellMetadata, type ShellConstructor } from '../shell';

export interface RouterOptions extends CoreRouterOptions {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly notFound?: React.ReactNode;
  readonly shell?: ShellConstructor;
}

export interface RouterPresentationDefinition {
  readonly exception: React.ReactNode | undefined;
  readonly fallback: React.ReactNode | undefined;
  readonly forbidden: React.ReactNode | undefined;
  readonly layouts: readonly LayoutConstructor[];
  readonly notFound: React.ReactNode | undefined;
  readonly shell: ShellConstructor | undefined;
}

export class Router extends CoreRouter {
  constructor(options: RouterOptions) {
    super(options);

    if (options.shell) {
      getShellMetadata(options.shell);
    }

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
      fallback: options.fallback,
      forbidden: options.forbidden,
      layouts,
      notFound: options.notFound,
      shell: options.shell,
    });
  }
}

const EMPTY_ROUTER_PRESENTATION = Object.freeze<RouterPresentationDefinition>({
  exception: undefined,
  fallback: undefined,
  forbidden: undefined,
  layouts: Object.freeze([]),
  notFound: undefined,
  shell: undefined,
});
const routerPresentationDefinitions = new WeakMap<RouterDeclaration, RouterPresentationDefinition>();

export const getRouterPresentationDefinition = (router: RouterDeclaration): RouterPresentationDefinition => {
  return routerPresentationDefinitions.get(router) ?? EMPTY_ROUTER_PRESENTATION;
};
