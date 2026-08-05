import React from 'react';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ControllerLoaderResult } from '../../contract/controller';
import { useControllerRuntime } from '../controller-runtime-context';

export const useLoaderData = <TController>(
  controller: DependencyToken<TController>,
): ControllerLoaderResult<TController> => {
  const controllerRuntime = useControllerRuntime();

  return React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => controllerRuntime.runtime.subscribe(onStoreChange),
      [controllerRuntime.runtime],
    ),
    React.useCallback(
      () => controllerRuntime.runtime.getLoaderData<ControllerLoaderResult<TController>>(controller),
      [controller, controllerRuntime.runtime],
    ),
    React.useCallback(
      () => controllerRuntime.runtime.getLoaderData<ControllerLoaderResult<TController>>(controller),
      [controller, controllerRuntime.runtime],
    ),
  );
};
