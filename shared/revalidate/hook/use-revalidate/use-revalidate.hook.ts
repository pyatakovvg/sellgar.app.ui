import React from 'react';

import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type { ControllerRuntimeContextValue } from '../../../controller/runtime/controller-runtime';

export type RevalidateHandler = (() => Promise<void>) & {
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useRuntimeRevalidate = (
  runtime: Pick<
    ControllerRuntimeContextValue,
    'subscribe' | 'getRevalidateRevision' | 'getRevalidateState' | 'revalidate'
  >,
  controllerToken?: DependencyToken<unknown>,
): RevalidateHandler => {
  const subscribe = React.useCallback((listener: () => void) => runtime.subscribe(listener), [runtime]);
  const getSnapshot = React.useMemo(() => {
    let revision: number | undefined;
    let snapshot: Pick<RevalidateHandler, 'error' | 'inProcess'> | undefined;

    return () => {
      const nextRevision = runtime.getRevalidateRevision();

      if (snapshot && revision === nextRevision) return snapshot;

      const state = runtime.getRevalidateState(controllerToken);

      revision = nextRevision;

      if (!snapshot || snapshot.inProcess !== state.inProcess || !Object.is(snapshot.error, state.error)) {
        snapshot = Object.freeze({ error: state.error, inProcess: state.inProcess });
      }

      return snapshot;
    };
  }, [controllerToken, runtime]);
  const runtimeState = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const revalidate = React.useCallback(
    () =>
      runtime.revalidate({
        controllerToken,
      }),
    [controllerToken, runtime],
  );

  return React.useMemo(
    () =>
      Object.assign(() => revalidate(), {
        error: runtimeState.error,
        inProcess: runtimeState.inProcess,
      }) as RevalidateHandler,
    [revalidate, runtimeState.error, runtimeState.inProcess],
  );
};
