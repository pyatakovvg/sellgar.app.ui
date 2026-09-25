import React from 'react';

import { useControllerRuntime } from '../../runtime/controller-runtime-context';

export const useParams = <
  TParams extends Record<keyof TParams, unknown> = Record<string, unknown>,
>(): Readonly<TParams> => {
  const runtime = useControllerRuntime();
  const params = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getParams(), [runtime]),
    React.useCallback(() => runtime.getParams(), [runtime]),
  );

  return params as Readonly<TParams>;
};
