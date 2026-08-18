import type { RuntimeScope } from '../../scope/base';

import type { RuntimeProviderContextInterface } from './runtime-provider.interface.ts';

const runtimeProviderScopes = new WeakMap<RuntimeProviderContextInterface, RuntimeScope>();

export const bindRuntimeProviderScope = <TContext extends RuntimeProviderContextInterface>(
  context: TContext,
  scope: RuntimeScope,
): TContext => {
  runtimeProviderScopes.set(context, scope);

  return context;
};

export const getRuntimeProviderScope = (context: RuntimeProviderContextInterface): RuntimeScope => {
  const scope = runtimeProviderScopes.get(context);

  if (!scope) {
    throw new Error('Runtime scope provider-контекста недоступен.');
  }

  return scope;
};
