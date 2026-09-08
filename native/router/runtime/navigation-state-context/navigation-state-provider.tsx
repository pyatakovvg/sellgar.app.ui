import React from 'react';

import type { NativePresentationRuntime } from '../native-presentation-runtime';
import { NavigationStateContext } from './navigation-state-context.ts';

interface IProps {
  readonly children: React.ReactNode;
  readonly source: NativePresentationRuntime;
}

export const NavigationStateProvider: React.FC<IProps> = (props) => {
  const value = React.useMemo(() => Object.freeze({ source: props.source }), [props.source]);

  return <NavigationStateContext.Provider value={value}>{props.children}</NavigationStateContext.Provider>;
};
