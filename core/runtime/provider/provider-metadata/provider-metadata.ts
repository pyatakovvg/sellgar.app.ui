import { Injectable } from '../../../di/injection/decorators';

export const PROVIDER_METADATA_KEY = Symbol('tiyn-app:provider:metadata');

export type ProviderLifetime = 'application' | 'runtime';

export interface ProviderMetadata {
  readonly lifetime: ProviderLifetime;
}

export const defineProvider = (constructor: Function, lifetime: ProviderLifetime): void => {
  Injectable()(constructor);
  Reflect.defineMetadata(PROVIDER_METADATA_KEY, { lifetime } satisfies ProviderMetadata, constructor);
};

export const getProviderMetadata = (token: unknown): ProviderMetadata | undefined => {
  if (typeof token !== 'function') {
    return undefined;
  }

  return Reflect.getMetadata(PROVIDER_METADATA_KEY, token) as ProviderMetadata | undefined;
};
