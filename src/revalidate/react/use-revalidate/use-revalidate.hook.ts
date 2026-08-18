import React from 'react';

import type { DependencyToken } from '../../../di/token/dependency-token';
import { useControllerRuntime } from '../../../controller/react/controller-runtime-context';

export type RevalidateHandler = (() => Promise<void>) & {
  readonly error: unknown;
  readonly inProcess: boolean;
};

export const useRevalidate = (controllerToken?: DependencyToken<unknown>): RevalidateHandler => {
  const controllerRuntime = useControllerRuntime();
  const revalidateSessionRef = React.useRef<AbortController | null>(null);
  const [inProcess, setInProcess] = React.useState(false);
  const [error, setError] = React.useState<unknown>(undefined);
  const runtimeRevalidateRevision = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        return controllerRuntime.subscribe(onStoreChange);
      },
      [controllerRuntime],
    ),
    React.useCallback(() => controllerRuntime.getRevalidateRevision(), [controllerRuntime]),
    React.useCallback(() => controllerRuntime.getRevalidateRevision(), [controllerRuntime]),
  );
  const runtimeRevalidateState = React.useMemo(
    () => controllerRuntime.getRevalidateState(controllerToken),
    [controllerRuntime, controllerToken, runtimeRevalidateRevision],
  );
  React.useEffect(() => {
    return () => {
      revalidateSessionRef.current?.abort();
      revalidateSessionRef.current = null;
    };
  }, []);

  const revalidate = React.useCallback(async () => {
    if (revalidateSessionRef.current) {
      throw new Error('Обновление контроллера уже выполняется.');
    }

    if (controllerRuntime.getRevalidateState(controllerToken).inProcess) {
      throw new Error('Обновление контроллера уже выполняется.');
    }

    const abortController = new AbortController();

    revalidateSessionRef.current = abortController;
    setError(undefined);
    setInProcess(true);

    try {
      await controllerRuntime.revalidate({
        controllerToken,
        signal: abortController.signal,
      });
    } catch (error) {
      if (revalidateSessionRef.current === abortController) {
        setError(error);
      }

      throw error;
    } finally {
      if (revalidateSessionRef.current === abortController) {
        revalidateSessionRef.current = null;
        setInProcess(false);
      }
    }
  }, [controllerRuntime, controllerToken]);

  return React.useMemo(
    () =>
      Object.assign(revalidate, {
        error: runtimeRevalidateState.error ?? error,
        inProcess: runtimeRevalidateState.inProcess || inProcess,
      }) as RevalidateHandler,
    [error, inProcess, revalidate, runtimeRevalidateState.error, runtimeRevalidateState.inProcess],
  );
};
