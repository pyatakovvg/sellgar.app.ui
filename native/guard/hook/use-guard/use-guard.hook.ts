import React from 'react';

import type { GuardDeclarations } from '../../../../core/guard/declaration/guard-declaration';
import { GuardRunner } from '../../../../core/guard/runtime/guard-runner';
import { useRuntimeScope } from '../../../runtime/scope/runtime-scope-context';

interface GuardEvaluationFailure {
  readonly error: unknown;
}

export const useGuard = <TContext = void>(
  declarations: GuardDeclarations<TContext>,
  context: TContext = void 0 as TContext,
): boolean => {
  const scope = useRuntimeScope();
  const [failure, setFailure] = React.useState<GuardEvaluationFailure | null>(null);
  const [isAllowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let isActive = true;

    setFailure(null);
    void new GuardRunner(scope)
      .execute(declarations, context)
      .then((result) => {
        if (isActive) {
          setAllowed(result.type === 'pass');
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setFailure({ error });
        }
      });

    return () => {
      isActive = false;
    };
  }, [context, declarations, scope]);

  if (failure !== null) {
    throw failure.error;
  }

  return isAllowed;
};
