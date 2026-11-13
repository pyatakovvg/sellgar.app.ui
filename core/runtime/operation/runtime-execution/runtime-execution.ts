import type { NavigationOperation } from '../../../router/runtime/navigation-operation';
import type { RuntimeScope } from '../../scope/base/runtime-scope';

export interface RuntimeExecution {
  readonly id: symbol;
  readonly kind: 'load' | 'revalidation';
  readonly navigation: NavigationOperation | null;
  readonly owner: RuntimeScope;
}

export const createRuntimeExecution = (
  kind: RuntimeExecution['kind'],
  owner: RuntimeScope,
  navigation: NavigationOperation | null = null,
): RuntimeExecution => Object.freeze({ id: Symbol(kind), kind, navigation, owner });
