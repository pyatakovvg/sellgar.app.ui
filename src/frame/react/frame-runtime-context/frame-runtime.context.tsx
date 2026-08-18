import React from 'react';

import type { FrameRuntime } from '../../runtime/frame-runtime';

export const FrameRuntimeContext = React.createContext<FrameRuntime | null>(null);

export interface FrameRuntimeProviderProps {
  readonly children: React.ReactNode;
  readonly runtime: FrameRuntime;
}

export const FrameRuntimeProvider = ({ children, runtime }: FrameRuntimeProviderProps): React.ReactElement => {
  return <FrameRuntimeContext.Provider value={runtime}>{children}</FrameRuntimeContext.Provider>;
};

export const useFrameRuntime = (): FrameRuntime => {
  const runtime = React.useContext(FrameRuntimeContext);

  if (!runtime) {
    throw new Error('Runtime фрейма недоступен.');
  }

  return runtime;
};
