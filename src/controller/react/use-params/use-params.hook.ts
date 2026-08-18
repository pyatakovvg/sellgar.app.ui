import React from 'react';

import { useControllerRuntime } from '../controller-runtime-context';

export const useParams = <
  TParams extends Record<keyof TParams, string | undefined> = Record<string, string | undefined>,
>(): Readonly<TParams> => {
  const runtime = useControllerRuntime();
  const subscribe = React.useCallback((listener: () => void) => runtime.subscribe(listener), [runtime]);
  const getSnapshot = React.useCallback(() => runtime.getParams(), [runtime]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot) as Readonly<TParams>;
};
