import React from 'react';

import type { FrameRuntime } from '../../runtime/frame-runtime';

export const FrameRuntimeContext = React.createContext<FrameRuntime<object> | null>(null);

export interface FrameRuntimeProviderProps<TProps extends object = object> {
  readonly children: React.ReactNode;
  readonly runtime: FrameRuntime<TProps>;
}

export const FrameRuntimeProvider = <TProps extends object = object>({
  children,
  runtime,
}: FrameRuntimeProviderProps<TProps>): React.ReactElement => {
  return (
    <FrameRuntimeContext.Provider value={runtime as unknown as FrameRuntime<object>}>
      {children}
    </FrameRuntimeContext.Provider>
  );
};

export const useFrameRuntime = <TProps extends object = Record<string, never>>(): FrameRuntime<TProps> => {
  const runtime = React.useContext(FrameRuntimeContext);

  if (!runtime) {
    throw new Error('Runtime фрейма недоступен.');
  }

  return runtime as unknown as FrameRuntime<TProps>;
};
