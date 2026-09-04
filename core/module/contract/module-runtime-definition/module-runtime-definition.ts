import type { ProviderToken } from '../../../runtime/provider/provider-token';

export type ModuleToken = abstract new (...args: never[]) => unknown;

export interface ModuleRuntimeDefinition<TPresentation = unknown> {
  readonly bindingOwners: readonly unknown[];
  readonly presentation: TPresentation;
  readonly providers: readonly ProviderToken[];
  readonly token: ModuleToken;
}

export interface CreateModuleRuntimeDefinitionOptions<TPresentation> {
  readonly bindingOwners?: readonly unknown[];
  readonly presentation: TPresentation;
  readonly providers?: readonly ProviderToken[];
  readonly token: ModuleToken;
}

export const createModuleRuntimeDefinition = <TPresentation>(
  options: CreateModuleRuntimeDefinitionOptions<TPresentation>,
): ModuleRuntimeDefinition<TPresentation> => {
  return Object.freeze({
    bindingOwners: Object.freeze([...(options.bindingOwners ?? [])]),
    presentation: options.presentation,
    providers: Object.freeze([...(options.providers ?? [])]),
    token: options.token,
  });
};
