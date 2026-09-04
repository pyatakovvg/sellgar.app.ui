import React from 'react';
import type { PanGesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

import type { ShellController } from '../../declaration/shell';

export interface ShellScrollBounds {
  readonly bottom: number;
  readonly top: number;
}

export interface ShellRuntimeContextValue {
  readonly controller: ShellController;
  readonly dismissGesture: PanGesture;
  readonly scrollBounds: SharedValue<ShellScrollBounds | null>;
  readonly scrollOffset: SharedValue<number>;
}

const ShellRuntimeContext = React.createContext<ShellRuntimeContextValue | null>(null);

export const ShellRuntimeProvider = ShellRuntimeContext.Provider;

export const useShellRuntime = (): ShellRuntimeContextValue => {
  const runtime = React.useContext(ShellRuntimeContext);

  if (!runtime) {
    throw new Error('Shell API доступен только внутри Native @Shell view.');
  }

  return runtime;
};
