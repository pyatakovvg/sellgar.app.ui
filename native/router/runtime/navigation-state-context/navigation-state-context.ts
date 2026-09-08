import React from 'react';

import type { NativePresentationRuntime } from '../native-presentation-runtime';

export interface NavigationStateContextValue {
  readonly source: NativePresentationRuntime;
}

export const NavigationStateContext = React.createContext<NavigationStateContextValue | null>(null);
