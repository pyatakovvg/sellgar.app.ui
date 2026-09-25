import React from 'react';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useApplicationFeaturesRuntime } from '../../../../shared/application/feature/application-features-host';

import { ControllerRuntimeContext, type ControllerRuntimeContextValue } from './controller-runtime-context.ts';

export const useControllerRuntime = (controllerToken?: DependencyToken<unknown>): ControllerRuntimeContextValue => {
  const runtime = React.useContext(ControllerRuntimeContext);
  const features = useApplicationFeaturesRuntime();
  if (features && controllerToken && features.ownsController(controllerToken)) return features;
  if (runtime === null && features) return features;

  if (runtime === null) {
    throw new Error('Runtime controllers недоступны.');
  }

  return runtime;
};
