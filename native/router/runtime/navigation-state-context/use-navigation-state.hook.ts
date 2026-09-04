import React from 'react';

import type { NavigationStateContextValue } from './navigation-state-context.ts';
import { NavigationStateContext } from './navigation-state-context.ts';

export const useNavigationState = (): NavigationStateContextValue => {
  const state = React.useContext(NavigationStateContext);

  if (state === null) {
    throw new Error('Navigation state недоступен вне Application view.');
  }

  return state;
};
