import React from 'react';

import type { ApplicationNavigationSnapshot } from '../../../../core/application/lifecycle/application';
import { NavigationStateContext } from './navigation-state-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly snapshot: ApplicationNavigationSnapshot;
}

export const NavigationStateProvider: React.FC<IProps> = (props) => {
  const value = React.useMemo(() => Object.freeze({ snapshot: props.snapshot }), [props.snapshot]);

  return <NavigationStateContext.Provider value={value}>{props.children}</NavigationStateContext.Provider>;
};
