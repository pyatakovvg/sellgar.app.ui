import React from 'react';

import type { ApplicationNavigationSnapshot } from '../../../../core/application/lifecycle/application';
import { NavigationStateContext } from './navigation-state-context.ts';

export interface NavigationStateValue {
  readonly snapshot: ApplicationNavigationSnapshot;
}

export const useNavigationState = (): NavigationStateValue => {
  const state = React.useContext(NavigationStateContext);

  if (state === null) {
    throw new Error('Navigation state недоступен вне Application view.');
  }

  const presentation = React.useSyncExternalStore(
    state.source.subscribeNavigation,
    state.source.getNavigationSnapshot,
    state.source.getNavigationSnapshot,
  );

  return React.useMemo(() => Object.freeze({ snapshot: presentation }), [presentation]);
};
