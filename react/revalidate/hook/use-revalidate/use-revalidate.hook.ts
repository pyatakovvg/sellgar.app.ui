import React from 'react';

import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { useControllerRuntime } from '../../../controller/runtime/controller-runtime-context';

export type RevalidateHandler = (() => Promise<void>) & {
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useRevalidate = (controllerToken?: DependencyToken<unknown>): RevalidateHandler => {
  const runtime = useControllerRuntime();
  const revision = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getRevalidateRevision(), [runtime]),
    React.useCallback(() => runtime.getRevalidateRevision(), [runtime]),
  );
  const runtimeState = React.useMemo(
    () => runtime.getRevalidateState(controllerToken),
    [controllerToken, revision, runtime],
  );

  const revalidate = React.useCallback(
    () =>
      runtime.revalidate({
        controllerToken,
      }),
    [controllerToken, runtime],
  );

  return React.useMemo(
    () =>
      Object.assign(revalidate, {
        error: runtimeState.error,
        inProcess: runtimeState.inProcess,
      }) as RevalidateHandler,
    [revalidate, runtimeState.error, runtimeState.inProcess],
  );
};
