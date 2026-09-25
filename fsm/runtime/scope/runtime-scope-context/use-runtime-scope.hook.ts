import React from 'react';

import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import { RuntimeScopeContext } from './runtime-scope-context.ts';

export const useRuntimeScope = (): RuntimeScope => {
  const scope = React.useContext(RuntimeScopeContext);

  if (scope === null) {
    throw new Error('Runtime scope недоступен.');
  }

  return scope;
};
