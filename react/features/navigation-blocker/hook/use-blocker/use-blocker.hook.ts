import React from 'react';

import {
  NavigationBlockerServiceInterface,
  type NavigationBlockerDecisionHandler,
} from '../../../../../core/features/navigation-blocker/contract/navigation-blocker-service';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';
import { NavigationBlockerPresentationRegistry } from '../../presentation/navigation-blocker-presentation-registry';

export type NavigationBlockerConditionValue = boolean | (() => boolean);

export interface UseBlockerOptions {
  readonly onLeave?: NavigationBlockerDecisionHandler;
  readonly onStay?: NavigationBlockerDecisionHandler;
  readonly presentation?: NavigationBlockerPresentation;
}

export const useBlocker = (condition: NavigationBlockerConditionValue, options?: UseBlockerOptions): void => {
  const blocker = useDependency(NavigationBlockerServiceInterface);
  const registry = useDependency(NavigationBlockerPresentationRegistry);
  const conditionRef = React.useRef(condition);
  const onLeaveRef = React.useRef(options?.onLeave);
  const onStayRef = React.useRef(options?.onStay);

  conditionRef.current = condition;
  onLeaveRef.current = options?.onLeave;
  onStayRef.current = options?.onStay;

  React.useEffect(() => {
    const registration = blocker.register(
      () => {
        const currentCondition = conditionRef.current;

        return typeof currentCondition === 'function' ? currentCondition() : currentCondition;
      },
      {
        onLeave: () => onLeaveRef.current?.(),
        onStay: () => onStayRef.current?.(),
      },
    );
    const unregisterPresentation = options?.presentation
      ? registry.register(registration.identity, options.presentation)
      : null;

    return () => {
      unregisterPresentation?.();
      registration.dispose();
    };
  }, [blocker, options?.presentation, registry]);
};
