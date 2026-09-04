import React from 'react';

import type { ControllerLoaderResult } from '../../../../core/controller/contract/controller';
import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useControllerRuntime } from '../../runtime/controller-runtime-context';

export const useLoaderData = <TController>(
  controllerToken: DependencyToken<TController>,
): ControllerLoaderResult<TController> => {
  const runtime = useControllerRuntime();

  return React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(
      () => runtime.getLoaderData<ControllerLoaderResult<TController>>(controllerToken),
      [controllerToken, runtime],
    ),
    React.useCallback(
      () => runtime.getLoaderData<ControllerLoaderResult<TController>>(controllerToken),
      [controllerToken, runtime],
    ),
  );
};
