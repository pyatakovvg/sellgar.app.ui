import React from 'react';

import type { DependencyToken } from '../../di/token/dependency-token';

import type { RuntimeScopeInterface } from '../scope/contract';

const RuntimeScopeContext = React.createContext<RuntimeScopeInterface | null>(null);

export interface RuntimeScopeProviderProps {
  readonly children: React.ReactNode;
  readonly scope: RuntimeScopeInterface;
}

export const RuntimeScopeProvider: React.FC<RuntimeScopeProviderProps> = ({ children, scope }) => {
  return <RuntimeScopeContext.Provider value={scope}>{children}</RuntimeScopeContext.Provider>;
};

export const useRuntimeScope = (): RuntimeScopeInterface => {
  const scope = React.useContext(RuntimeScopeContext);

  if (scope === null) {
    throw new Error('Runtime scope недоступен.');
  }

  return scope;
};

export const useDependency = <TValue,>(token: DependencyToken<TValue>): TValue => {
  return useRuntimeScope().get(token);
};
