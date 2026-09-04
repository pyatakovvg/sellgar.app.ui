import React from 'react';

import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import { RuntimeScopeContext } from './runtime-scope-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly scope: RuntimeScope;
}

export const RuntimeScopeProvider: React.FC<IProps> = (props) => {
  return <RuntimeScopeContext.Provider value={props.scope}>{props.children}</RuntimeScopeContext.Provider>;
};
