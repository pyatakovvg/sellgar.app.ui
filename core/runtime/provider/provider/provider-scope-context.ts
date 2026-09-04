import type { RuntimeScope } from '../../scope/base/runtime-scope';

import type { ProviderOperationContextInterface } from './provider.interface.ts';

const providerScopes = new WeakMap<ProviderOperationContextInterface, RuntimeScope>();

export const bindProviderScope = <TContext extends ProviderOperationContextInterface>(
  context: TContext,
  scope: RuntimeScope,
): TContext => {
  providerScopes.set(context, scope);

  return context;
};

export const getProviderScope = (context: ProviderOperationContextInterface): RuntimeScope => {
  const scope = providerScopes.get(context);

  if (!scope) {
    throw new Error('Runtime scope provider-контекста недоступен.');
  }

  return scope;
};
