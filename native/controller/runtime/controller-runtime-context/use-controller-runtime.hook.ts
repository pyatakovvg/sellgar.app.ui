import React from 'react';

import { ControllerRuntimeContext, type ControllerRuntimeContextValue } from './controller-runtime-context.ts';

export const useControllerRuntime = (): ControllerRuntimeContextValue => {
  const runtime = React.useContext(ControllerRuntimeContext);

  if (runtime === null) {
    throw new Error('Runtime controllers недоступны.');
  }

  return runtime;
};
