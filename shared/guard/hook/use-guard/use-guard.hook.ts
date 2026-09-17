import React from 'react';
import type { GuardDeclarations } from '../../../../core/guard/declaration/guard-declaration';
import { GuardRunner } from '../../../../core/guard/runtime/guard-runner';
import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';

interface GuardEvaluation<TContext> {
  readonly scope: RuntimeScope;
  readonly declarations: GuardDeclarations<TContext>;
  readonly context: TContext;
  readonly result: { readonly allowed: boolean } | { readonly error: unknown };
}

export const useRuntimeGuard = <TContext = void>(
  scope: RuntimeScope,
  declarations: GuardDeclarations<TContext>,
  context: TContext = void 0 as TContext,
): boolean => {
  const [evaluation, setEvaluation] = React.useState<GuardEvaluation<TContext> | null>(null);

  React.useEffect(() => {
    let active = true;
    const publish = (result: GuardEvaluation<TContext>['result']): void => {
      if (active) setEvaluation({ scope, declarations, context, result });
    };
    void new GuardRunner(scope).execute(declarations, context).then(
      (result) => publish({ allowed: result.type === 'pass' }),
      (error) => publish({ error }),
    );
    return () => {
      active = false;
    };
  }, [context, declarations, scope]);

  if (
    !evaluation ||
    evaluation.scope !== scope ||
    evaluation.declarations !== declarations ||
    !Object.is(evaluation.context, context)
  )
    return false;
  if ('error' in evaluation.result) throw evaluation.result.error;
  return evaluation.result.allowed;
};
