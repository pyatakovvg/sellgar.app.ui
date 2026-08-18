import React from 'react';

import { useDependency } from '../../../../runtime/react';
import { NavigationBlockerServiceInterface } from '../../contract/navigation-blocker-service';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';

export type NavigationBlockerConditionValue = boolean | (() => boolean);

export interface UseBlockerOptions {
  readonly presentation?: NavigationBlockerPresentation;
}

export const useBlocker = (condition: NavigationBlockerConditionValue, options?: UseBlockerOptions): void => {
  const blocker = useDependency(NavigationBlockerServiceInterface);
  const conditionRef = React.useRef(condition);

  conditionRef.current = condition;

  React.useEffect(() => {
    const registration = blocker.register(
      () => {
        const currentCondition = conditionRef.current;

        return typeof currentCondition === 'function' ? currentCondition() : currentCondition;
      },
      { presentation: options?.presentation },
    );

    return () => registration.dispose();
  }, [blocker, options?.presentation]);
};
