import React from 'react';

import { useRuntimeScope } from '../../../runtime/react';
import { GuardRunner } from '../../runtime/guard-runner';
import type { GuardDeclarations } from '../../declaration/guard-declaration';

export const useGuard = <TContext = void>(
  declarations: GuardDeclarations<TContext>,
  context: TContext = void 0 as TContext,
): boolean => {
  const scope = useRuntimeScope();
  const [error, setError] = React.useState<unknown>(null);
  const [isAllowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let isActive = true;

    setError(null);
    void new GuardRunner(scope)
      .execute(declarations, context)
      .then((result) => {
        if (isActive) {
          setAllowed(result.type === 'pass');
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setError(error);
        }
      });

    return () => {
      isActive = false;
    };
  }, [context, declarations, scope]);

  if (error) {
    throw error;
  }

  return isAllowed;
};
