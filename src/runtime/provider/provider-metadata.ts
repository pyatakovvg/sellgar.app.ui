import { Injectable } from '../../di/injection/decorators';

export const PROVIDER_METADATA_KEY = Symbol('tiyn-app:provider:metadata');

export type ProviderKind = 'runtime' | 'singleton';

export interface ProviderMetadata {
  readonly kind: ProviderKind;
}

export const defineProvider = (constructor: Function, kind: ProviderKind): void => {
  Injectable()(constructor);
  Reflect.defineMetadata(PROVIDER_METADATA_KEY, { kind } satisfies ProviderMetadata, constructor);
};

export const getProviderMetadata = (token: unknown): ProviderMetadata | undefined => {
  if (typeof token !== 'function') {
    return undefined;
  }

  return Reflect.getMetadata(PROVIDER_METADATA_KEY, token) as ProviderMetadata | undefined;
};
