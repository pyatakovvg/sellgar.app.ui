import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useRuntimeScope } from './use-runtime-scope.hook.ts';

export const useDependency = <TValue>(token: DependencyToken<TValue>): TValue => {
  return useRuntimeScope().get(token);
};
