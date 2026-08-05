import { defineProvider, getProviderMetadata } from '../provider-metadata.ts';

import type { SingletonProviderInterface } from './singleton-provider.interface.ts';

export type SingletonProviderConstructor = abstract new (...args: never[]) => SingletonProviderInterface;

export type SingletonProviderDecorator = <TConstructor extends SingletonProviderConstructor>(
  constructor: TConstructor,
) => void;

export const SingletonProvider = (): SingletonProviderDecorator => {
  return (constructor) => {
    defineProvider(constructor, 'singleton');
  };
};

export const isSingletonProviderToken = (token: unknown): token is SingletonProviderConstructor => {
  return getProviderMetadata(token)?.kind === 'singleton';
};
