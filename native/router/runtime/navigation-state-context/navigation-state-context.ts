import React from 'react';

import type { ApplicationNavigationSnapshot } from '../../../../core/application/lifecycle/application';

export interface NavigationStateContextValue {
  readonly snapshot: ApplicationNavigationSnapshot;
}

export const NavigationStateContext = React.createContext<NavigationStateContextValue | null>(null);
