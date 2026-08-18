import React from 'react';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ControllerLoaderResult } from '../../contract/controller';
import { useControllerRuntime } from '../controller-runtime-context';

export const useLoaderData = <TController>(
  controller: DependencyToken<TController>,
): ControllerLoaderResult<TController> => {
  const controllerRuntime = useControllerRuntime();

  return React.useSyncExternalStore(
    React.useCallback((onStoreChange) => controllerRuntime.subscribe(onStoreChange), [controllerRuntime]),
    React.useCallback(
      () => controllerRuntime.getLoaderData(controller) as ControllerLoaderResult<TController>,
      [controller, controllerRuntime],
    ),
    React.useCallback(
      () => controllerRuntime.getLoaderData(controller) as ControllerLoaderResult<TController>,
      [controller, controllerRuntime],
    ),
  );
};
