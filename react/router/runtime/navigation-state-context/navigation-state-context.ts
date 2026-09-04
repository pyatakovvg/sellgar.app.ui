import React from 'react';

import type { ApplicationNavigationSnapshot } from '../../../../core/application/lifecycle/application';
import type { NavigationState } from '../../../../core/router/runtime/navigation-state';

export interface NavigationStateContextValue {
  readonly createHref: (navigation: NavigationState) => string;
  readonly snapshot: ApplicationNavigationSnapshot;
}

export const NavigationStateContext = React.createContext<NavigationStateContextValue | null>(null);
