import React from 'react';

import type { ApplicationNavigationSnapshot } from '../../../../core/application/lifecycle/application';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';
import { NavigationStateContext } from './navigation-state-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly createHref: (navigation: NavigationState) => string;
  readonly snapshot: ApplicationNavigationSnapshot;
}

export const NavigationStateProvider: React.FC<IProps> = (props) => {
  const value = React.useMemo(
    () => Object.freeze({ createHref: props.createHref, snapshot: props.snapshot }),
    [props.createHref, props.snapshot],
  );

  return <NavigationStateContext.Provider value={value}>{props.children}</NavigationStateContext.Provider>;
};
