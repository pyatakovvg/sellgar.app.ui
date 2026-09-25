import React from 'react';

import { useWidgetRuntime } from '../../runtime/widget-runtime-context';

export const useWidgetProps = <TProps extends object>(): TProps => {
  const runtime = useWidgetRuntime<TProps>();

  React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getPropsRevision(), [runtime]),
    React.useCallback(() => runtime.getPropsRevision(), [runtime]),
  );

  return runtime.getProps();
};
