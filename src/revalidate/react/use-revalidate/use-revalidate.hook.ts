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
  const widgetRevalidateRevision = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        return controllerRuntime.kind === 'widget' ? controllerRuntime.runtime.subscribe(onStoreChange) : () => {};
      },
      [controllerRuntime],
    ),
    React.useCallback(
      () => (controllerRuntime.kind === 'widget' ? controllerRuntime.runtime.getRevalidateRevision() : 0),
      [controllerRuntime],
    ),
    React.useCallback(
      () => (controllerRuntime.kind === 'widget' ? controllerRuntime.runtime.getRevalidateRevision() : 0),
      [controllerRuntime],
    ),
  );
  const widgetRevalidateState = React.useMemo(() => {
    return controllerRuntime.kind === 'widget'
      ? controllerRuntime.runtime.getRevalidateState(controllerToken)
      : DEFAULT_REVALIDATE_STATE;
  }, [controllerRuntime, controllerToken, widgetRevalidateRevision]);

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

    if (
      controllerRuntime.kind === 'widget' &&
      controllerRuntime.runtime.getRevalidateState(controllerToken).inProcess
    ) {
      throw new Error('Обновление контроллера уже выполняется.');
    }

    const abortController = new AbortController();

    revalidateSessionRef.current = abortController;
    setError(undefined);
    setInProcess(true);

    try {
      await controllerRuntime.runtime.revalidate({
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
        error: controllerRuntime.kind === 'widget' ? widgetRevalidateState.error : error,
        inProcess: controllerRuntime.kind === 'widget' ? widgetRevalidateState.inProcess : inProcess,
      }) as RevalidateHandler,
    [
      controllerRuntime.kind,
      error,
      inProcess,
      revalidate,
      widgetRevalidateState.error,
      widgetRevalidateState.inProcess,
    ],
  );
};

const DEFAULT_REVALIDATE_STATE = {
  error: undefined,
  inProcess: false,
};
