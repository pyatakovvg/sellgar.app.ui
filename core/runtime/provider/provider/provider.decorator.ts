import { defineProvider, getProviderMetadata, type ProviderLifetime } from '../provider-metadata';

export interface ProviderOptions {
  readonly lifetime?: ProviderLifetime;
}

export const Provider = (options: ProviderOptions = {}): ClassDecorator => {
  return (constructor) => {
    defineProvider(constructor, options.lifetime ?? 'runtime');
  };
};

export const isProviderToken = (token: unknown): token is Function => {
  return getProviderMetadata(token) !== undefined;
};
