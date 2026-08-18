import type React from 'react';

import type { DependencyConstructor } from '../../../../di/binding/binding-builder';
import type { FrameShellInterface } from '../../../declaration/frame';
import type { LayoutConstructor } from '../../../../layout/declaration/layout';
import type { RoutePolicyDeclaration } from '../../../../router/runtime/route-runtime-context';
import type { ProviderToken } from '../../../../runtime/provider/provider-token.ts';
import type { FrameRoute } from '../frame-route';

export interface FrameRouterOptions {
  readonly baseSource: string;
  readonly canActivate?: readonly RoutePolicyDeclaration[];
  readonly canMatch?: readonly RoutePolicyDeclaration[];
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly notFound?: React.ReactNode;
  readonly providers?: readonly ProviderToken[];
  readonly routes: readonly FrameRoute[];
  readonly shell?: DependencyConstructor<FrameShellInterface>;
}

export interface FrameRouterDefinition {
  readonly baseSource: string;
  readonly canActivate: readonly RoutePolicyDeclaration[];
  readonly canMatch: readonly RoutePolicyDeclaration[];
  readonly exception: React.ReactNode | undefined;
  readonly fallback: React.ReactNode | undefined;
  readonly forbidden: React.ReactNode | undefined;
  readonly layouts: readonly LayoutConstructor[];
  readonly notFound: React.ReactNode | undefined;
  readonly providers: readonly ProviderToken[];
  readonly routes: readonly FrameRoute[];
  readonly shell: DependencyConstructor<FrameShellInterface> | undefined;
}

const frameRouterDefinitions = new WeakMap<FrameRouter, FrameRouterDefinition>();

export class FrameRouter {
  declare private readonly frameRouterBrand: void;

  constructor(options: FrameRouterOptions) {
    const baseSource = normalizeFrameRouterSource(options.baseSource);

    if (baseSource.length === 0) {
      throw new Error('baseSource frame-роутера не может быть пустым.');
    }

    if (options.routes.length === 0) {
      throw new Error('FrameRouter должен содержать маршруты.');
    }

    frameRouterDefinitions.set(this, {
      baseSource,
      canActivate: [...(options.canActivate ?? [])],
      canMatch: [...(options.canMatch ?? [])],
      exception: options.exception,
      fallback: options.fallback,
      forbidden: options.forbidden,
      layouts: [...(options.layouts ?? [])],
      notFound: options.notFound,
      providers: [...(options.providers ?? [])],
      routes: [...options.routes],
      shell: options.shell,
    });
  }
}

export const getFrameRouterDefinition = (router: FrameRouter): FrameRouterDefinition => {
  const definition = frameRouterDefinitions.get(router);

  if (!definition) {
    throw new Error('Декларация frame-роутера не определена.');
  }

  return definition;
};

export const isFrameRouter = (value: unknown): value is FrameRouter => {
  return typeof value === 'object' && value !== null && frameRouterDefinitions.has(value as FrameRouter);
};

const normalizeFrameRouterSource = (source: string): string => {
  return source.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
};
