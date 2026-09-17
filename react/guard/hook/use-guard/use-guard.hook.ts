import type { GuardDeclarations } from '../../../../core/guard/declaration/guard-declaration';
import { useRuntimeGuard } from '../../../../shared/guard/hook/use-guard';
import { useRuntimeScope } from '../../../runtime/scope/runtime-scope-context';

export const useGuard = <TContext = void>(
  declarations: GuardDeclarations<TContext>,
  context: TContext = void 0 as TContext,
): boolean => useRuntimeGuard(useRuntimeScope(), declarations, context);
