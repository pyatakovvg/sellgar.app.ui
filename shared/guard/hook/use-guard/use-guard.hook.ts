import React from 'react';
import type { GuardDeclarations } from '../../../../core/guard/declaration/guard-declaration';
import { GuardRunner } from '../../../../core/guard/runtime/guard-runner';
import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';

export const useRuntimeGuard = <TContext = void>(
  scope: RuntimeScope,
  declarations: GuardDeclarations<TContext>,
  context: TContext = void 0 as TContext,
): boolean => {
  const [error, setError] = React.useState<unknown>(null);
  const [isAllowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    setError(null);

    void new GuardRunner(scope).execute(declarations, context).then(
      (result) => {
        if (active) {
          setAllowed(result.type === 'pass');
        }
      },
      (error: unknown) => {
        if (active) {
          setError(error);
        }
      },
    );

    return () => {
      active = false;
    };
  }, [context, declarations, scope]);

  if (error) {
    throw error;
  }

  return isAllowed;
};
