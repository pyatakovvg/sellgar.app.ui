import { defineProvider, getProviderMetadata } from '../provider-metadata.ts';

export const RUNTIME_PROVIDER_METADATA_KEY = Symbol('tiyn-app:runtime-provider:metadata');

export const Provider = (): ClassDecorator => {
  return (constructor) => {
    defineProvider(constructor, 'runtime');
    Reflect.defineMetadata(RUNTIME_PROVIDER_METADATA_KEY, true, constructor);
  };
};

export const isRuntimeProviderToken = (token: unknown): token is Function => {
  return (
    typeof token === 'function' &&
    Reflect.getMetadata(RUNTIME_PROVIDER_METADATA_KEY, token) === true &&
    getProviderMetadata(token)?.kind === 'runtime'
  );
};
